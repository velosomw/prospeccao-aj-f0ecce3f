// Service de custos / tokens — Gestor IA Financeiro
// Espelha o cálculo do trigger SQL e agrega indicadores por período.
import { supabase } from "@/integrations/supabase/client";

export type PeriodKey = "mes" | "trimestre" | "semestre" | "ano" | "total";

export interface CostConfigRow {
  id: string;
  provider: string;
  service: string;
  label: string;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  cost_per_request: number;
  cost_per_page: number;
  cost_fixed: number;
  currency?: string;
  active: boolean;
  notes?: string | null;
  updated_at?: string;
}

export interface UsageLogRow {
  id: string;
  type: string;
  provider: string;
  service: string;
  document_id?: string | null;
  tokens_input: number;
  tokens_output: number;
  requests: number;
  pages: number;
  cost_calculated: number;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface CostBreakdown {
  service: string;
  label: string;
  cost: number;
  pct: number;
  tokens_input: number;
  tokens_output: number;
  requests: number;
  pages: number;
}

export interface CostInsight {
  level: "info" | "warning" | "critical";
  alerta: string;
  causa: string;
  acao: string;
}

export interface PlatformCounts {
  prospecçãosTotal: number;            // Prospecçãos distintos analisados (prospecção_analysis_results)
  prospecçãosConcluidos: number;
  prospecçãosEmAnalise: number;
  balancetesRuns: number;       // balancete_runs total
  balancetesConsolidados: number;
  relatoriosFinalizados: number;  // prospecção_documents status='finalizado'
  relatoriosEmElaboracao: number; // prospecção_documents status<>'finalizado'
  documentosOcr: number;        // ai_extractions distintos
}

export interface CostIndicators {
  custoTotal: number;
  custoBalancete: number;          // custo IA atribuído a OCR/extraction/embedding
  custoRelatorio: number;          // custo IA atribuído a geração de relatório
  custoIaOcrProcessamento: number; // OCR + extraction + embedding + classification + validation
  custoMedioExecucao: number;      // custoTotal / Prospecçãos reais
  custoMedioPorProspecção: number;        // custoTotal / nº Prospecçãos
  custoMedioPorBalancete: number;  // custoBalancete / nº runs balancete
  custoMedioPorRelatorio: number;  // custoRelatorio / nº relatórios (finalizados+andamento)
  totalBalancetes: number;
  totalRelatorios: number;
  counts: PlatformCounts;
  breakdown: CostBreakdown[];
  monthlySeries: { mes: string; custo: number }[];
  last6Months: { mes: string; custo: number }[];
  byService: { service: string; label: string; custo: number }[];
  insights: CostInsight[];
  period: PeriodKey;
  periodLabel: string;
}

const PERIOD_LABEL: Record<PeriodKey, string> = {
  mes: "Mês atual",
  trimestre: "Últimos 3 meses",
  semestre: "Últimos 6 meses",
  ano: "Últimos 12 meses",
  total: "Todo o período",
};

export function calculateCost(
  usage: { tokens_input?: number; tokens_output?: number; requests?: number; pages?: number },
  config: Pick<CostConfigRow, "cost_per_1k_input" | "cost_per_1k_output" | "cost_per_request" | "cost_per_page" | "cost_fixed">,
): number {
  const ti = +(usage.tokens_input ?? 0) || 0;
  const to = +(usage.tokens_output ?? 0) || 0;
  const rq = +(usage.requests ?? 0) || 0;
  const pg = +(usage.pages ?? 0) || 0;
  return (
    (ti / 1000) * +config.cost_per_1k_input +
    (to / 1000) * +config.cost_per_1k_output +
    rq * +config.cost_per_request +
    pg * +config.cost_per_page +
    +config.cost_fixed
  );
}

export async function fetchCostConfig(): Promise<CostConfigRow[]> {
  const { data, error } = await supabase
    .from("ai_cost_config" as never)
    .select("*")
    .order("provider", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CostConfigRow[];
}

export async function upsertCostConfig(row: Partial<CostConfigRow> & { service: string; provider: string; label: string }) {
  const payload = { ...row, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("ai_cost_config" as never).upsert(payload as never, { onConflict: "service" } as never);
  if (error) throw error;
}

export async function fetchUsageLogs(limit = 5000): Promise<UsageLogRow[]> {
  const { data, error } = await supabase
    .from("ai_usage_logs" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as UsageLogRow[];
}

function periodCutoff(period: PeriodKey): Date | null {
  const now = new Date();
  switch (period) {
    case "mes":       return new Date(now.getFullYear(), now.getMonth(), 1);
    case "trimestre": return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case "semestre":  return new Date(now.getFullYear(), now.getMonth() - 5, 1);
    case "ano":       return new Date(now.getFullYear(), now.getMonth() - 11, 1);
    case "total":
    default:          return null;
  }
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function fetchCostIndicators(period: PeriodKey = "mes"): Promise<CostIndicators> {
  const [logs, config] = await Promise.all([fetchUsageLogs(), fetchCostConfig()]);
  const cutoff = periodCutoff(period);
  const filtered = cutoff ? logs.filter((l) => new Date(l.created_at) >= cutoff) : logs;

  const cfgByService = new Map(config.map((c) => [c.service, c]));

  const isReportType = (t: string) => /relatorio|insight/i.test(t);
  const isBalanceteType = (t: string) => /balancete|ocr|embedding|mapping|balanco|extracao/i.test(t);

  const balanceteLogs = filtered.filter((l) => isBalanceteType(l.type));
  const relatorioLogs = filtered.filter((l) => isReportType(l.type));

  const sum = (arr: UsageLogRow[]) => arr.reduce((acc, l) => acc + (+l.cost_calculated || 0), 0);

  const custoTotal = sum(filtered);
  const custoBalancete = sum(balanceteLogs);
  const custoRelatorio = sum(relatorioLogs);

  // Custo IA + OCR de processamento de documentos (OCR/extração/embedding/classificação/validação)
  const PROC_TYPES = new Set(["ocr", "extraction", "classification", "embedding", "validation"]);
  const custoIaOcrProcessamento = sum(
    filtered.filter((l) => {
      const t = String(l.type ?? "").toLowerCase();
      const svc = String(l.service ?? "").toLowerCase();
      return PROC_TYPES.has(t) || svc.includes("vision") || svc.includes("document_ai") || svc.includes("embedding");
    }),
  );

  // Denominadores REAIS da plataforma (não dependem de metadata em logs)
  const counts = await fetchPlatformCounts(cutoff);

  // Custos médios por unidade real
  const custoMedioPorProspecção       = counts.prospecçãosTotal > 0 ? custoTotal / counts.prospecçãosTotal : 0;
  const custoMedioPorBalancete = counts.balancetesRuns > 0 ? custoBalancete / counts.balancetesRuns : 0;
  const totalRel = counts.relatoriosFinalizados + counts.relatoriosEmElaboracao;
  const custoMedioPorRelatorio = totalRel > 0 ? custoRelatorio / totalRel : 0;
  const custoMedioExecucao     = counts.prospecçãosTotal > 0 ? custoTotal / counts.prospecçãosTotal : 0;

  const totalBalancetes = counts.balancetesRuns;
  const totalRelatorios = totalRel;

  // breakdown por service
  const byServiceMap = new Map<string, CostBreakdown>();
  for (const l of filtered) {
    const cfg = cfgByService.get(l.service);
    const label = cfg?.label ?? l.service;
    const prev = byServiceMap.get(l.service) ?? {
      service: l.service,
      label,
      cost: 0,
      pct: 0,
      tokens_input: 0,
      tokens_output: 0,
      requests: 0,
      pages: 0,
    };
    prev.cost += +l.cost_calculated || 0;
    prev.tokens_input += +l.tokens_input || 0;
    prev.tokens_output += +l.tokens_output || 0;
    prev.requests += +l.requests || 0;
    prev.pages += +l.pages || 0;
    byServiceMap.set(l.service, prev);
  }
  const breakdown = Array.from(byServiceMap.values())
    .map((b) => ({ ...b, pct: custoTotal > 0 ? (b.cost / custoTotal) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost);

  // série mensal (12 meses)
  const monthMap = new Map<string, number>();
  for (const l of logs) {
    const k = monthKey(new Date(l.created_at));
    monthMap.set(k, (monthMap.get(k) ?? 0) + (+l.cost_calculated || 0));
  }
  const now = new Date();
  const monthlySeries: { mes: string; custo: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = monthKey(d);
    monthlySeries.push({ mes: k, custo: monthMap.get(k) ?? 0 });
  }
  const last6Months = monthlySeries.slice(-6);

  const byService = breakdown.map((b) => ({ service: b.service, label: b.label, custo: b.cost }));

  // Insights
  const insights: CostInsight[] = [];
  const zeroCostWithTokens = filtered.filter(
    (l) => (+l.cost_calculated || 0) === 0 && ((+l.tokens_input || 0) > 0 || (+l.tokens_output || 0) > 0),
  ).length;
  if (zeroCostWithTokens > 0) {
    insights.push({
      level: "critical",
      alerta: `${zeroCostWithTokens} log(s) sem custo calculado`,
      causa: "Tokens registrados, mas custo = 0 — provável serviço fora da tabela de preços.",
      acao: "Execute o Diagnóstico para recalcular o histórico.",
    });
  }
  if (breakdown.length > 0 && breakdown[0].pct > 60) {
    insights.push({
      level: "warning",
      alerta: `${breakdown[0].label} concentra ${breakdown[0].pct.toFixed(1)}% do custo`,
      causa: "Concentração elevada em um único serviço.",
      acao: "Avalie migrar parte dos casos para Gemini Flash (mais barato).",
    });
  }
  const proCost = breakdown.find((b) => /pro/i.test(b.service))?.cost ?? 0;
  if (proCost > 0 && custoTotal > 0 && proCost / custoTotal > 0.3) {
    const economia = proCost * 0.85; // estimativa
    insights.push({
      level: "info",
      alerta: `Possível economia de ~${economia.toFixed(2)} USD`,
      causa: "Mais de 30% do custo está em modelo Pro.",
      acao: "Use Pro só para insight final; mapping/noprospecçãolização pode ir para Flash.",
    });
  }

  return {
    custoTotal,
    custoBalancete,
    custoRelatorio,
    custoIaOcrProcessamento,
    custoMedioExecucao,
    custoMedioPorProspecção,
    custoMedioPorBalancete,
    custoMedioPorRelatorio,
    totalBalancetes,
    totalRelatorios,
    counts,
    breakdown,
    monthlySeries,
    last6Months,
    byService,
    insights,
    period,
    periodLabel: PERIOD_LABEL[period],
  };
}

/** Conta unidades reais da plataforma para usar como denominadores de custo médio. */
export async function fetchPlatformCounts(cutoff: Date | null): Promise<PlatformCounts> {
  const since = cutoff ? cutoff.toISOString() : null;

  const cnt = async (table: string, filter?: (q: ReturnType<typeof supabase.from>) => unknown) => {
    let q: any = supabase.from(table as never).select("*", { count: "exact", head: true });
    if (since) q = q.gte("created_at", since);
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) { console.warn(`[counts] ${table}:`, error.message); return 0; }
    return count ?? 0;
  };

  const [prospecçãosTotal, prospecçãosConcluidos, prospecçãosEmAnalise, balancetesRuns, balancetesConsolidados,
    relatoriosFinalizados, relatoriosEmElaboracao, documentosOcr] = await Promise.all([
    cnt("prospecção_analysis_results"),
    cnt("prospecção_analysis_results", (q: any) => q.eq("status", "concluido")),
    cnt("prospecção_analysis_results", (q: any) => q.eq("status", "em_analise")),
    cnt("balancete_runs"),
    cnt("balancete_consolidado"),
    cnt("prospecção_documents", (q: any) => q.eq("status", "finalizado")),
    cnt("prospecção_documents", (q: any) => q.neq("status", "finalizado")),
    cnt("ai_extractions"),
  ]);

  return {
    prospecçãosTotal, prospecçãosConcluidos, prospecçãosEmAnalise,
    balancetesRuns, balancetesConsolidados,
    relatoriosFinalizados, relatoriosEmElaboracao,
    documentosOcr,
  };
}

/** Recalcula custo histórico gerando logs de ajuste (delta) — não muta histórico. */
export async function runCostDiagnostics(): Promise<{ adjustments: number; deltaTotal: number; ignored: number }> {
  const [logs, config] = await Promise.all([fetchUsageLogs(), fetchCostConfig()]);
  const cfgByService = new Map(config.map((c) => [c.service, c]));
  let adjustments = 0;
  let deltaTotal = 0;
  let ignored = 0;
  const inserts: Partial<UsageLogRow>[] = [];

  for (const l of logs) {
    if (l.type === "adjustment") continue;
    const cfg = cfgByService.get(l.service);
    if (!cfg) continue;
    const recalc = calculateCost(l, cfg);
    const orig = +l.cost_calculated || 0;
    if (recalc === orig) continue;
    const lo = Math.max(Math.min(orig, recalc), 1e-9);
    const hi = Math.max(orig, recalc);
    if (hi / lo > 10) { ignored++; continue; }
    const delta = recalc - orig;
    deltaTotal += delta;
    adjustments++;
    inserts.push({
      type: "adjustment",
      provider: l.provider,
      service: l.service,
      document_id: l.document_id ?? null,
      tokens_input: 0,
      tokens_output: 0,
      requests: 0,
      pages: 0,
      cost_calculated: delta,
      metadata: { source: "diagnostics", original_log: l.id, original_cost: orig, recalculated_cost: recalc } as never,
    });
  }

  if (inserts.length > 0) {
    // batch em chunks de 200
    for (let i = 0; i < inserts.length; i += 200) {
      const chunk = inserts.slice(i, i + 200);
      const { error } = await supabase.from("ai_usage_logs" as never).insert(chunk as never);
      if (error) throw error;
    }
  }
  return { adjustments, deltaTotal, ignored };
}

/** Loga um uso individual (chamado pelas Edge Functions). */
export async function logAiUsage(input: {
  type: string;
  provider: string;
  service: string;
  document_id?: string | null;
  tokens_input?: number;
  tokens_output?: number;
  requests?: number;
  pages?: number;
  metadata?: Record<string, unknown>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("ai_usage_logs" as never).insert({
    type: input.type,
    provider: input.provider,
    service: input.service,
    document_id: input.document_id ?? null,
    tokens_input: input.tokens_input ?? 0,
    tokens_output: input.tokens_output ?? 0,
    requests: input.requests ?? 0,
    pages: input.pages ?? 0,
    metadata: input.metadata ?? null,
    created_by: user?.id ?? null,
  } as never);
  if (error) throw error;
}
