// balancete-build — Fase 2 do Pipeline RMA
// Orquestra: lista docs do mês → garante OCR (Vision) → garante extração (ai-process)
//   → extrai lançamentos → mapeia descrição→conta (cache + COA template)
//   → grava lancamentos → consolida balancete_consolidado → reconcilia (Ativo=Passivo+PL).
//
// Endpoints:
//   POST /balancete-build  body: { company_id, rma_id?, year, month, template_name?, force?: boolean }
//     → 202 { run_id }  (processa em background com EdgeRuntime.waitUntil)
//   GET  /balancete-build?run_id=<uuid>  → status, progress, totais, reconciliação
//
// Tabelas: balancete_runs, lancamentos, balancete_consolidado, account_mapping_cache, chart_of_accounts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

// ============= Tipos =============
interface BuildRequest {
  company_id: string;
  rma_id?: string;
  year?: number;
  month?: number; // 1-12
  template_name?: string; // default "XPT_BR_PADRAO_V1"
  force?: boolean; // re-extrai mesmo se já houver lancamentos
  use_smart_prompt?: boolean; // opt-in: usa o prompt-builder inteligente para enriquecer ai-process
  empresa_nome?: string; // contexto opcional p/ smart prompt
  auto_period?: boolean; // detecta período automaticamente do nome do arquivo
  action?: "build" | "orphans" | "backfill"; // backfill = consolida ai_extractions órfãs no período auto-detectado
  consolidate_only?: boolean; // SOMENTE consolida docs que já têm ai_extractions.completed (não chama OCR/IA)
}

// ============= Detecção automática de período por arquivo =============
// Aceita: 02-2026, 02.2026, 02_2026, 02/2026, 022026, 2026-02, 2026.02, fev2026, fevereiro/2026
const MES_NOMES: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, março: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6, jul: 7, julho: 7,
  ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10,
  nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

export function detectPeriodFromName(name: string): { year: number; month: number } | null {
  if (!name) return null;
  const s = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1) MM[sep]AAAA  (sep = - . _ / espaço)
  let m = s.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[\s\-._\/]+(20\d{2})(?![0-9])/);
  if (m) return { month: Number(m[1]), year: Number(m[2]) };

  // 2) AAAA[sep]MM
  m = s.match(/(?:^|[^0-9])(20\d{2})[\s\-._\/]+(0?[1-9]|1[0-2])(?![0-9])/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };

  // 3) MMAAAA (6 dígitos contíguos) — ex: 022026
  m = s.match(/(?:^|[^0-9])(0[1-9]|1[0-2])(20\d{2})(?![0-9])/);
  if (m) return { month: Number(m[1]), year: Number(m[2]) };

  // 4) AAAAMM (6 dígitos contíguos) — ex: 202602
  m = s.match(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(?![0-9])/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };

  // 5) MM-AA  (2 dígitos ano) — ex: 02-26
  m = s.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[\s\-._\/]+(2\d)(?![0-9])/);
  if (m) return { month: Number(m[1]), year: 2000 + Number(m[2]) };

  // 6) Nome do mês + ano — ex: "fevereiro 2026", "fev/2026", "fev2026"
  m = s.match(/(jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)[\s\-._\/]*(20\d{2})/);
  if (m) {
    const mes = MES_NOMES[m[1]] ?? null;
    if (mes) return { month: mes, year: Number(m[2]) };
  }

  return null;
}

interface ExtractedLine {
  descricao: string;
  valor: number;            // sinalizado: + = débito; - = crédito (fallback)
  debito?: number | null;   // explícito quando vier no documento
  credito?: number | null;  // explícito quando vier no documento
  saldo?: number | null;    // explícito quando vier no documento
  data?: string | null;
  tipo?: string | null;     // debito/credito/saldo
  pagina?: number | null;
  linha?: number | null;
  conta_sugerida?: string | null;
  codigo?: string | null;
  grupo?: string | null;
  subgrupo?: string | null;
}

interface AccountMatch {
  conta: string;
  descricao_padronizada: string;
  confianca: number;
  source: "cache" | "exact" | "fuzzy" | "fallback";
  codigo?: string | null;
  grupo?: string | null;
  subgrupo?: string | null;
  tipo?: string | null;
}

interface RunSummary {
  files_total: number;
  files_processed: number;
  files_skipped: number;
  lancamentos_criados: number;
  contas_consolidadas: number;
  reconciliation: {
    ativo: number;
    passivo: number;
    patrimonio_liquido: number;
    diff: number;
    passed: boolean;
  } | null;
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ============= Utils =============
function normDesc(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

async function appendLog(runId: string, line: string) {
  // log é jsonb array — append idempotente via SQL
  const { data: cur } = await supabase
    .from("balancete_runs")
    .select("log")
    .eq("id", runId)
    .single();
  const log = Array.isArray(cur?.log) ? cur!.log : [];
  log.push({ t: new Date().toISOString(), msg: line });
  await supabase.from("balancete_runs").update({ log }).eq("id", runId);
}

async function updateRun(runId: string, patch: Record<string, unknown>) {
  await supabase.from("balancete_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", runId);
}

// ============= 1. Lista documentos do mês =============
// Convenção: documentos do mês N estão em pipeline_documents do RMA
// (rma_topic = 0 no modo flat, ou qualquer tópico no modo legado).
// Filtramos por rma_id; o "mês" é responsabilidade do path/upload.
async function listMonthDocuments(
  rmaId: string | undefined,
  companyId: string,
  opts: { incremental?: boolean; year?: number; month?: number } = {},
) {
  let effectiveRmaId = rmaId;
  if (!effectiveRmaId) {
    const { data: c } = await supabase.from("companies").select("rma_id").eq("id", companyId).single();
    effectiveRmaId = c?.rma_id || undefined;
  }
  if (!effectiveRmaId) return { rmaId: null, docs: [] as any[], skippedUnchanged: 0 };

  const { data, error } = await supabase
    .from("pipeline_documents")
    .select("id, file_name, mime_type, storage_path, external_id, provider, ocr_text, document_type, pipeline_status")
    .eq("rma_id", effectiveRmaId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`list pipeline_documents: ${error.message}`);
  let docs = data || [];
  let skippedUnchanged = 0;

  // Build incremental (Phase 4): filtra docs cujo arquivo OneDrive
  // não mudou desde o último processamento (status=processed e
  // last_modified <= last_processed_at). Mantém docs sem tracker.
  if (opts.incremental) {
    const externalIds = docs.map((d) => d.external_id).filter(Boolean) as string[];
    if (externalIds.length > 0) {
      const { data: trackers } = await supabase
        .from("onedrive_files")
        .select("file_id,status,last_modified,last_processed_at")
        .in("file_id", externalIds);
      const trackMap = new Map((trackers ?? []).map((t) => [t.file_id, t]));
      docs = docs.filter((d) => {
        const t = trackMap.get(d.external_id ?? "");
        if (!t) return true; // sem tracker → processar (segurança)
        if (t.status !== "processed") return true; // pendente/erro → processar
        const modAfter = t.last_modified && t.last_processed_at
          && new Date(t.last_modified).getTime() > new Date(t.last_processed_at).getTime();
        if (modAfter) return true;
        skippedUnchanged++;
        return false;
      });
    }
  }

  return { rmaId: effectiveRmaId, docs, skippedUnchanged };
}

// ============= 2. Garantir OCR =============
async function ensureOcr(documentId: string, rmaId: string): Promise<{ text: string; confidence: number } | null> {
  const { data: existing } = await supabase
    .from("ocr_results")
    .select("normalized_text, raw_text, confidence, status")
    .eq("document_id", documentId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (existing && (existing.normalized_text || existing.raw_text)) {
    return {
      text: (existing.normalized_text || existing.raw_text) as string,
      confidence: Number(existing.confidence ?? 0.8),
    };
  }
  // Dispara OCR via edge function
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/ocr-google-vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ documentId, rmaId, persist: true }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { text: (j.normalized_text || j.raw_text || "") as string, confidence: Number(j.confidence ?? 0.7) };
  } catch (e) {
    console.error("ensureOcr failed", documentId, e);
    return null;
  }
}

// ============= 3. Garantir extração IA =============
// Quando smartPromptCtx é informado, monta um prompt enriquecido via prompt-builder
// (camada complementar; ai-process recebe o campo opcional `extra_system_prompt`).
async function ensureExtraction(
  documentId: string,
  rmaId: string,
  text: string,
  ocrConfidence: number,
  smartPromptCtx?: { company_id: string; empresa?: string; periodo?: string },
) {
  const { data: existing } = await supabase
    .from("ai_extractions")
    .select("id, classe, extracted_data, final_confidence, status")
    .eq("document_id", documentId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (existing?.extracted_data) return existing;

  // Smart Prompt opt-in
  let smartPrompt: string | null = null;
  if (smartPromptCtx) {
    try {
      const pbRes = await fetch(`${SUPABASE_URL}/functions/v1/prompt-builder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        body: JSON.stringify({
          classe: "balancete",
          input_text: text.slice(0, 4000),
          contexto: { tipo_documento: "Balancete/Extrato/DRE", empresa: smartPromptCtx.empresa, periodo: smartPromptCtx.periodo },
          company_id: smartPromptCtx.company_id,
          rma_id: rmaId,
          document_id: documentId,
          persist: true,
        }),
      });
      const pbJson = await pbRes.json().catch(() => ({}));
      if (pbJson?.prompt) smartPrompt = pbJson.prompt as string;
    } catch (e) {
      console.warn("smart prompt failed (non-fatal):", e);
    }
  }

  // Aciona ai-process síncrono (texto curto) ou pega o job se for grande
  const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify({
      document_id: documentId,
      rma_id: rmaId,
      text,
      ocr_confidence: ocrConfidence,
      ...(smartPrompt ? { extra_system_prompt: smartPrompt } : {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (j?.id) {
    // Aguarda até 60s pelo término (poll)
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 2000));
      const { data: row } = await supabase
        .from("ai_extractions")
        .select("id, classe, extracted_data, final_confidence, status")
        .eq("id", j.id)
        .single();
      if (row?.status === "completed") return row;
      if (row?.status === "failed") return null;
    }
    return null;
  }
  return j?.extracted_data ? j : null;
}

// ============= 4. Extrai linhas de lançamento =============
// Heurística defensiva: percorre o JSON do agente em busca de arrays {descricao, valor}
// + reconhece o layout BEx (campos `extenso` + `saldo_atual` + `nivel`).
//
// 🚨 Regras BEx (Blueprint Motor de Balancetes Kanitz):
//   - Códigos com `len(extenso) === 10` são FOLHAS contábeis (somar).
//   - Códigos com `len < 10` são totalizadores sintéticos (IGNORAR — geram duplicidade).
//   - Fonte de verdade do saldo: `saldo_atual` (fechamento). Fallback: saldo_anterior + (debito - credito).
//
// Classificação determinística por prefixo do código (sem IA):
//   1xxxx → ativo · 2xxxx → passivo · 3xxxx → patrimônio_líquido · 4xxxx → receita · 5xxxx → despesa
//   11xxx → circulante (ativo) · 12xxx → não-circulante (ativo)
//   21xxx → circulante (passivo) · 22xxx → não-circulante (passivo)
function classifyByPrefix(codigo: string): { tipo: string | null; subgrupo: string | null; grupo: string | null } {
  const c = String(codigo || "").trim();
  if (!c || !/^\d+$/.test(c)) return { tipo: null, subgrupo: null, grupo: null };
  const t =
    c.startsWith("1") ? "ativo"
  : c.startsWith("2") ? "passivo"
  : c.startsWith("3") ? "patrimonio_liquido"
  : c.startsWith("4") ? "receita"
  : c.startsWith("5") ? "despesa"
  : null;
  const sub =
    c.startsWith("11") || c.startsWith("21") ? "circulante"
  : c.startsWith("12") || c.startsWith("22") ? "nao_circulante"
  : null;
  const grupo =
    t === "ativo" ? (sub === "circulante" ? "ativo_circulante" : sub === "nao_circulante" ? "ativo_nao_circulante" : "ativo")
  : t === "passivo" ? (sub === "circulante" ? "passivo_circulante" : sub === "nao_circulante" ? "passivo_nao_circulante" : "passivo")
  : t || null;
  return { tipo: t, subgrupo: sub, grupo };
}

function extractLines(extractedData: any, classe: string): ExtractedLine[] {
  if (!extractedData) return [];
  const lines: ExtractedLine[] = [];

  const candidates: any[] = [];
  if (Array.isArray(extractedData?.linhas)) candidates.push(...extractedData.linhas);
  if (Array.isArray(extractedData?.contas)) candidates.push(...extractedData.contas);
  if (Array.isArray(extractedData?.lancamentos)) candidates.push(...extractedData.lancamentos);
  if (Array.isArray(extractedData?.itens)) candidates.push(...extractedData.itens);

  for (const item of candidates) {
    // ===== Layout BEx (chave primária = `extenso`, fonte de verdade = `saldo_atual`) =====
    const extensoRaw = String(item.extenso ?? item.codigo_extenso ?? "").trim();
    const isBexRow = !!extensoRaw && /^\d+$/.test(extensoRaw);
    if (isBexRow) {
      const nivel = extensoRaw.length;
      // 🚨 Apenas folhas (len=10) — sintéticas geram duplo cômputo
      if (nivel !== 10) continue;
    }

    const descricao = String(item.descricao || item.conta_descricao || item.historico || "").trim();
    const parseNum = (v: any): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    const debitoRaw = item.debito ?? item.débito ?? null;
    const creditoRaw = item.credito ?? item.crédito ?? null;
    const saldoAnteriorNum = parseNum(item.saldo_anterior ?? item.saldoAnterior);
    const saldoAtualNum = parseNum(item.saldo_atual ?? item.saldoAtual);
    const saldoMesNum = parseNum(item.saldo_mes ?? item.saldoMes ?? item.saldo);
    const debito = parseNum(debitoRaw);
    const credito = parseNum(creditoRaw);

    // Fonte de verdade BEx: saldo_atual > saldo_mes > saldo_anterior + (D-C) > valor genérico
    let valor: number;
    if (saldoAtualNum != null) {
      valor = saldoAtualNum;
    } else if (saldoMesNum != null) {
      valor = saldoMesNum;
    } else if (saldoAnteriorNum != null && (debito != null || credito != null)) {
      valor = saldoAnteriorNum + (debito || 0) - (credito || 0);
    } else {
      const valorRaw = item.valor ?? item.montante ?? item.amount ?? null;
      valor = typeof valorRaw === "number" ? valorRaw : Number(String(valorRaw ?? "").replace(/\./g, "").replace(",", "."));
    }
    if (!descricao || !Number.isFinite(valor)) continue;

    const codigo = isBexRow ? extensoRaw : (item.codigo || item.código || null);
    const cls = codigo ? classifyByPrefix(codigo) : { tipo: null, subgrupo: null, grupo: null };

    lines.push({
      descricao,
      valor,
      debito,
      credito,
      saldo: saldoAtualNum ?? saldoMesNum ?? null,
      data: item.data || item.data_documento || null,
      tipo: item.tipo || item.natureza || cls.tipo || null,
      pagina: item.pagina ?? null,
      linha: item.linha ?? null,
      conta_sugerida: item.conta || codigo,
      codigo,
      grupo: item.grupo || cls.grupo || null,
      subgrupo: item.subgrupo || cls.subgrupo || null,
    });
  }

  // Comprovantes/PIX/boletos: 1 lançamento por documento
  if (lines.length === 0 && (classe === "PIX" || classe === "COMPROVANTE" || classe === "BOLETO" || classe === "BANK_RECEIPT")) {
    const valor = Number(extractedData?.valor || extractedData?.amount || 0);
    const descricao = String(extractedData?.descricao || extractedData?.historico || extractedData?.beneficiario || extractedData?.favorecido || "").trim();
    if (descricao && Number.isFinite(valor) && valor !== 0) {
      lines.push({
        descricao,
        valor,
        debito: valor >= 0 ? Math.abs(valor) : 0,
        credito: valor < 0 ? Math.abs(valor) : 0,
        saldo: valor,
        data: extractedData?.data || extractedData?.data_pagamento || null,
        tipo: classe.toLowerCase(),
      });
    }
  }

  // Fallback DRE/BALANCETE agregado: o agente devolveu apenas totais
  // (receita_bruta, receita_liquida, custos, despesas, lucro_liquido).
  // Geramos 1 lançamento sintético por métrica conhecida para alimentar o consolidado.
  if (lines.length === 0) {
    const aggMap: Array<{ key: string; descricao: string; tipo: "receita" | "despesa" | "patrimonio_liquido" | "ativo" | "passivo"; sinal: 1 | -1 }> = [
      { key: "receita_bruta",      descricao: "Receita Bruta",            tipo: "receita",            sinal: 1 },
      { key: "receita_liquida",    descricao: "Receita Líquida",          tipo: "receita",            sinal: 1 },
      { key: "custos",             descricao: "Custos",                   tipo: "despesa",            sinal: -1 },
      { key: "despesas",           descricao: "Despesas Operacionais",    tipo: "despesa",            sinal: -1 },
      { key: "lucro_liquido",      descricao: "Lucro Líquido do Período", tipo: "patrimonio_liquido", sinal: 1 },
      // BS — sintetiza linhas de balanço a partir dos totais agregados do agente
      { key: "ativo_total",        descricao: "Ativo Total",              tipo: "ativo",              sinal: 1 },
      { key: "passivo_total",      descricao: "Passivo Total",            tipo: "passivo",            sinal: 1 },
      { key: "patrimonio_liquido", descricao: "Patrimônio Líquido",       tipo: "patrimonio_liquido", sinal: 1 },
    ];
    // Sentinel codigos para que o bs-pnl-build classifique corretamente as linhas sintéticas
    const sentinelCodigo: Record<string, string> = {
      ativo_total: "1.SYNTH.ATIVO",
      passivo_total: "2.SYNTH.PASSIVO",
      patrimonio_liquido: "3.SYNTH.PL",
      receita_bruta: "4.SYNTH.RECEITA_BRUTA",
      receita_liquida: "4.SYNTH.RECEITA_LIQUIDA",
      custos: "5.SYNTH.CUSTOS",
      despesas: "5.SYNTH.DESPESAS",
      lucro_liquido: "3.SYNTH.LUCRO",
    };
    for (const m of aggMap) {
      const raw = extractedData?.[m.key];
      if (raw == null) continue;
      const v = typeof raw === "number" ? raw : Number(String(raw).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(v) || v === 0) continue;
      const valorAbs = Math.abs(v);
      const valor = m.sinal * valorAbs;
      const codigo = sentinelCodigo[m.key] || null;
      lines.push({
        descricao: m.descricao,
        valor,
        debito: valor >= 0 ? valorAbs : 0,
        credito: valor < 0 ? valorAbs : 0,
        saldo: valor,
        data: null,
        tipo: m.tipo,
        conta_sugerida: codigo,
        codigo,
      } as any);
    }
  }
  return lines;
}

// ============= 5. Mapeamento descrição → conta =============
// Estratégia em camadas: cache → exato no COA → fuzzy (jaccard sobre descrições do COA) → fallback OUTROS.
async function loadChartOfAccounts(companyId: string, templateName: string) {
  const cols = "conta, descricao, tipo, is_analytical, nivel, codigo, grupo, subgrupo";
  const { data: own } = await supabase
    .from("chart_of_accounts")
    .select(cols)
    .eq("company_id", companyId)
    .eq("is_analytical", true);
  if (own && own.length > 0) return own;
  const { data: tpl } = await supabase
    .from("chart_of_accounts")
    .select(cols)
    .eq("template_name", templateName)
    .eq("is_template", true)
    .eq("is_analytical", true);
  return tpl || [];
}

async function loadCache(companyId: string) {
  const { data } = await supabase
    .from("account_mapping_cache")
    .select("descricao_normalizada, conta, descricao_padronizada, confianca")
    .eq("company_id", companyId);
  const map = new Map<string, { conta: string; desc: string; conf: number }>();
  (data || []).forEach((r) => map.set(r.descricao_normalizada, { conta: r.conta, desc: r.descricao_padronizada, conf: Number(r.confianca) }));
  return map;
}

function matchAccount(
  descricao: string,
  contaSugerida: string | null | undefined,
  coa: any[],
  cache: Map<string, { conta: string; desc: string; conf: number }>,
): AccountMatch {
  const norm = normDesc(descricao);
  const enrich = (c: any, base: AccountMatch): AccountMatch => ({
    ...base,
    codigo: c?.codigo ?? null,
    grupo: c?.grupo ?? null,
    subgrupo: c?.subgrupo ?? null,
    tipo: c?.tipo ?? null,
  });

  // 1) cache (resolve estrutura via COA pelo conta)
  const cached = cache.get(norm);
  if (cached) {
    const meta = coa.find((c) => c.conta === cached.conta);
    return enrich(meta, { conta: cached.conta, descricao_padronizada: cached.desc, confianca: cached.conf, source: "cache" });
  }

  // 2) IA já sugeriu uma conta válida
  if (contaSugerida) {
    const hit = coa.find((c) => c.conta === contaSugerida);
    if (hit) return enrich(hit, { conta: hit.conta, descricao_padronizada: hit.descricao, confianca: 0.95, source: "exact" });
  }

  // 3) descrição exata
  const exact = coa.find((c) => normDesc(c.descricao) === norm);
  if (exact) return enrich(exact, { conta: exact.conta, descricao_padronizada: exact.descricao, confianca: 0.9, source: "exact" });

  // 4) fuzzy
  let best: { c: any; score: number } | null = null;
  for (const c of coa) {
    const s = jaccard(norm, normDesc(c.descricao));
    if (!best || s > best.score) best = { c, score: s };
  }
  if (best && best.score >= 0.5) {
    return enrich(best.c, { conta: best.c.conta, descricao_padronizada: best.c.descricao, confianca: best.score, source: "fuzzy" });
  }

  // 5) fallback — usa classificação por prefixo do código contábil quando disponível
  const cls = contaSugerida ? classifyByPrefix(String(contaSugerida)) : { tipo: null, grupo: null, subgrupo: null };
  return {
    conta: contaSugerida || "OUTROS",
    descricao_padronizada: descricao,
    confianca: cls.tipo ? 0.55 : 0.2,
    source: "fallback",
    codigo: contaSugerida || null,
    grupo: cls.grupo || "outros",
    subgrupo: cls.subgrupo,
    tipo: cls.tipo || "outros",
  };
}

// ============= 6. Persiste lancamentos + atualiza cache =============
async function persistLancamentos(
  rows: Array<{
    line: ExtractedLine;
    match: AccountMatch;
    documentId: string;
    extractionId: string | null;
    fileName: string;
    classe: string;
    ocrConf: number;
    iaConf: number;
  }>,
  companyId: string,
  rmaId: string | null,
  year: number,
  month: number,
) {
  if (rows.length === 0) return 0;

  const lancRows = rows.map((r) => {
    // Deriva débito/crédito/saldo se não vierem explícitos do extractor
    const valor = Number(r.line.valor) || 0;
    const debito = r.line.debito != null
      ? Number(r.line.debito)
      : (valor >= 0 ? Math.abs(valor) : 0);
    const credito = r.line.credito != null
      ? Number(r.line.credito)
      : (valor < 0 ? Math.abs(valor) : 0);
    const saldo = r.line.saldo != null ? Number(r.line.saldo) : (debito - credito);

    // merge_key determinístico — permite identificar duplicatas exatas (mesmo doc, mesma linha, mesmo valor)
    // mesmo que decidimos SOMAR sempre, é útil para auditoria/relatórios
    const mergeKeyRaw = `${r.documentId || "-"}|${r.line.linha ?? "-"}|${r.match.conta}|${valor}`;
    return {
      company_id: companyId,
      rma_id: rmaId,
      ano: year,
      mes: month,
      descricao_original: r.line.descricao,
      descricao_padronizada: r.match.descricao_padronizada,
      conta: r.match.conta,
      codigo: r.line.codigo ?? r.match.codigo ?? null,
      grupo: r.line.grupo ?? r.match.grupo ?? null,
      subgrupo: r.line.subgrupo ?? r.match.subgrupo ?? null,
      valor,
      debito,
      credito,
      saldo,
      tipo_lancamento: r.line.tipo || null,
      data_documento: r.line.data || null,
      document_id: r.documentId,
      extraction_id: r.extractionId,
      pagina: r.line.pagina ?? null,
      linha: r.line.linha ?? null,
      categoria: r.classe,
      origem_arquivo: r.fileName,
      confianca_ocr: r.ocrConf,
      confianca_ia: r.iaConf,
      confianca_mapeamento: r.match.confianca,
      status: r.match.confianca >= 0.7 ? "ok" : "review",
      merge_key: mergeKeyRaw, // texto plano (sha não é necessário aqui — o índice é btree)
      protected: true,
    };
  });

  const { error } = await supabase.from("lancamentos").insert(lancRows);
  if (error) throw new Error(`insert lancamentos: ${error.message}`);

  // Atualiza cache (upsert manual)
  for (const r of rows) {
    if (r.match.source === "fallback") continue;
    const norm = normDesc(r.line.descricao);
    const { data: existing } = await supabase
      .from("account_mapping_cache")
      .select("id, hits")
      .eq("company_id", companyId)
      .eq("descricao_normalizada", norm)
      .maybeSingle();
    if (existing) {
      await supabase.from("account_mapping_cache").update({
        hits: (existing.hits || 0) + 1,
        last_used_at: new Date().toISOString(),
        conta: r.match.conta,
        descricao_padronizada: r.match.descricao_padronizada,
        confianca: r.match.confianca,
      }).eq("id", existing.id);
    } else {
      await supabase.from("account_mapping_cache").insert({
        company_id: companyId,
        descricao_normalizada: norm,
        conta: r.match.conta,
        descricao_padronizada: r.match.descricao_padronizada,
        confianca: r.match.confianca,
        source: r.match.source === "cache" ? "ai" : r.match.source,
      });
    }
  }
  return lancRows.length;
}

// ============= 7. Consolida balancete_consolidado =============
async function consolidate(runId: string, companyId: string, rmaId: string | null, year: number, month: number) {
  // ===== MODO EVOLUTIVO =====
  // NÃO deletamos balancete_consolidado: fazemos UPSERT por (company_id, ano, mes, conta).
  // Lemos TODOS os lançamentos do período (cumulativo) e re-somamos para garantir consistência.

  // COA enriquecido
  const { data: coaAll } = await supabase
    .from("chart_of_accounts")
    .select("conta, descricao, tipo, nivel, is_analytical, codigo, grupo, subgrupo")
    .or(`company_id.eq.${companyId},template_name.eq.XPT_BR_PADRAO_V1`);
  const coaByAccount = new Map<string, any>();
  (coaAll || []).forEach((c) => { if (!coaByAccount.has(c.conta)) coaByAccount.set(c.conta, c); });

  // Snapshot anterior (calcula delta_valor por conta)
  const { data: prevCons } = await supabase
    .from("balancete_consolidado")
    .select("id, conta, valor, saldo")
    .eq("company_id", companyId).eq("ano", year).eq("mes", month);
  const prevByConta = new Map<string, { id: string; valor: number; saldo: number }>();
  (prevCons || []).forEach((p) => prevByConta.set(p.conta, { id: p.id, valor: Number(p.valor || 0), saldo: Number(p.saldo || 0) }));

  // Lê TODOS os lançamentos do período (cumulativo)
  const { data: lancs } = await supabase
    .from("lancamentos")
    .select("id, conta, descricao_padronizada, valor, debito, credito, saldo, codigo, grupo, subgrupo, document_id, origem_arquivo, confianca_ocr, confianca_ia, confianca_mapeamento")
    .eq("company_id", companyId)
    .eq("ano", year)
    .eq("mes", month);

  type DocContrib = { document_id: string | null; origem: string | null; valor: number; confianca: number };
  type Bucket = {
    valor: number; debito: number; credito: number; saldo: number;
    ids: string[]; descricao: string;
    codigo: string | null; grupo: string | null; subgrupo: string | null;
    confSum: number; confN: number;
    docs: Map<string, DocContrib>;
  };
  const buckets = new Map<string, Bucket>();
  (lancs || []).forEach((l) => {
    const cur = buckets.get(l.conta) || {
      valor: 0, debito: 0, credito: 0, saldo: 0,
      ids: [], descricao: l.descricao_padronizada || l.conta,
      codigo: l.codigo || null, grupo: l.grupo || null, subgrupo: l.subgrupo || null,
      confSum: 0, confN: 0, docs: new Map(),
    };
    cur.valor += Number(l.valor || 0);
    cur.debito += Number(l.debito || 0);
    cur.credito += Number(l.credito || 0);
    cur.saldo += Number(l.saldo || 0);
    cur.ids.push(l.id);
    const cg = 0.4 * Number(l.confianca_ocr || 0) + 0.3 * Number(l.confianca_ia || 0) + 0.3 * Number(l.confianca_mapeamento || 0);
    cur.confSum += cg;
    cur.confN += 1;
    const docKey = l.document_id || "manual";
    const dc = cur.docs.get(docKey) || { document_id: l.document_id, origem: l.origem_arquivo, valor: 0, confianca: 0 };
    dc.valor += Number(l.valor || 0);
    dc.confianca = Math.max(dc.confianca, cg);
    cur.docs.set(docKey, dc);
    buckets.set(l.conta, cur);
  });

  const versionRows: any[] = [];
  const conflictUpserts: any[] = [];
  let consContas = 0, conflitosCount = 0;

  for (const [conta, agg] of buckets.entries()) {
    const meta = coaByAccount.get(conta);
    const confGlobal = agg.confN > 0 ? Number((agg.confSum / agg.confN).toFixed(4)) : null;

    // Detecta conflito entre documentos
    const docContribs = Array.from(agg.docs.values()).filter((d) => d.document_id != null);
    let conflitoDetectado = false;
    let valorVencedor: number | null = null;
    let confiancaVencedor: number | null = null;
    let origemVencedor: string | null = null;
    if (docContribs.length >= 2) {
      const vals = docContribs.map((d) => Math.abs(d.valor));
      const maxV = Math.max(...vals);
      const minV = Math.min(...vals);
      const diff = maxV - minV;
      const tol = Math.max(1, maxV * 0.01);
      if (diff > tol) {
        conflitoDetectado = true;
        const winner = docContribs.reduce((a, b) => (b.confianca > a.confianca ? b : a));
        valorVencedor = winner.valor;
        confiancaVencedor = winner.confianca;
        origemVencedor = winner.origem;
        conflitosCount++;
        conflictUpserts.push({
          company_id: companyId, rma_id: rmaId, ano: year, mes: month, conta,
          descricao: meta?.descricao || agg.descricao,
          valores: docContribs.map((d) => ({
            valor: d.valor, confianca: Number(d.confianca.toFixed(4)),
            origem_arquivo: d.origem, document_id: d.document_id,
          })),
          valor_vencedor: valorVencedor,
          confianca_vencedor: confiancaVencedor != null ? Number(confiancaVencedor.toFixed(4)) : null,
          origem_vencedor: origemVencedor,
          diferenca_max: diff,
          status: "pendente",
          resolution_action: "maior_confianca",
        });
      }
    }

    const saldoFinal = conflitoDetectado && valorVencedor != null
      ? valorVencedor
      : (agg.saldo !== 0 ? agg.saldo : (agg.debito - agg.credito));

    const valorAnterior = prevByConta.get(conta)?.valor ?? 0;
    const deltaValor = agg.valor - valorAnterior;
    const novaVersao = (prevByConta.get(conta) ? 1 : 0) + 1;

    versionRows.push({
      company_id: companyId, rma_id: rmaId, ano: year, mes: month, conta,
      versao: novaVersao,
      run_id: runId,
      origem_arquivo: docContribs.map((d) => d.origem).filter(Boolean).slice(0, 5).join(", ") || null,
      document_id: null,
      valor: agg.valor, debito: agg.debito, credito: agg.credito, saldo: saldoFinal,
      confianca: confGlobal,
      delta_valor: deltaValor,
      acao: !prevByConta.has(conta) ? "criacao" : (conflitoDetectado ? "conflito" : "incremento"),
      details: { docs_count: docContribs.length, conflito: conflitoDetectado },
    });

    const consRow = {
      company_id: companyId,
      ano: year, mes: month, conta,
      descricao: meta?.descricao || agg.descricao,
      tipo: meta?.tipo || "outros",
      nivel: meta?.nivel || 5,
      codigo: meta?.codigo || agg.codigo || null,
      grupo: meta?.grupo || agg.grupo || null,
      subgrupo: meta?.subgrupo || agg.subgrupo || null,
      valor: agg.valor, debito: agg.debito, credito: agg.credito, saldo: saldoFinal,
      qtd_lancamentos: agg.ids.length,
      origem_lancamento_ids: agg.ids,
      confianca_global: confGlobal,
      run_id: runId,
      reconciliation_notes: { has_conflict: conflitoDetectado, docs_count: docContribs.length },
    };

    const prev = prevByConta.get(conta);
    if (prev) {
      const { error } = await supabase.from("balancete_consolidado").update(consRow).eq("id", prev.id);
      if (error) throw new Error(`update balancete_consolidado: ${error.message}`);
    } else {
      const { error } = await supabase.from("balancete_consolidado").insert(consRow);
      if (error) throw new Error(`insert balancete_consolidado: ${error.message}`);
    }
    consContas++;
  }

  if (versionRows.length > 0) {
    const { error } = await supabase.from("balancete_versions").insert(versionRows);
    if (error) console.warn("balancete_versions insert warning:", error.message);
  }

  for (const conf of conflictUpserts) {
    const { data: existing } = await supabase
      .from("balancete_conflicts")
      .select("id, status")
      .eq("company_id", companyId).eq("ano", year).eq("mes", month).eq("conta", conf.conta)
      .maybeSingle();
    if (existing) {
      if (existing.status !== "resolvido" && existing.status !== "ignorado") {
        await supabase.from("balancete_conflicts").update(conf).eq("id", existing.id);
      }
    } else {
      await supabase.from("balancete_conflicts").insert(conf);
    }
  }

  return { contas: consContas, versoes: versionRows.length, conflitos: conflitosCount };
}


// ============= 7b. DRE Consolidado =============
async function buildDRE(runId: string, companyId: string, rmaId: string | null, year: number, month: number) {
  await supabase.from("dre_consolidado")
    .delete().eq("company_id", companyId).eq("ano", year).eq("mes", month);

  // Agrega contas do tipo receita/despesa do balancete consolidado
  const { data: rows } = await supabase
    .from("balancete_consolidado")
    .select("conta, descricao, tipo, codigo, grupo, subgrupo, valor, debito, credito, saldo, qtd_lancamentos, origem_lancamento_ids, confianca_global")
    .eq("company_id", companyId).eq("ano", year).eq("mes", month);

  const dreRows: any[] = [];
  let receita = 0, despesa = 0;
  (rows || []).forEach((r) => {
    const tipo = String(r.tipo || "").toLowerCase();
    if (!["receita", "despesa", "custo", "resultado"].some((t) => tipo.includes(t))) return;
    const isReceita = tipo.includes("receita");
    const valor = Number(r.saldo || r.valor || 0);
    if (isReceita) receita += valor; else despesa += Math.abs(valor);
    dreRows.push({
      company_id: companyId, rma_id: rmaId, ano: year, mes: month, run_id: runId,
      codigo: r.codigo, grupo: r.grupo || (isReceita ? "receita_bruta" : "despesas_op"),
      subgrupo: r.subgrupo, conta: r.conta, descricao: r.descricao,
      tipo: isReceita ? "receita" : "despesa", nivel: 1,
      valor, debito: Number(r.debito || 0), credito: Number(r.credito || 0), saldo: valor,
      qtd_lancamentos: r.qtd_lancamentos || 0,
      origem_lancamento_ids: r.origem_lancamento_ids || [],
      confianca_global: r.confianca_global ?? null,
    });
  });

  // Linha de resultado
  dreRows.push({
    company_id: companyId, rma_id: rmaId, ano: year, mes: month, run_id: runId,
    grupo: "resultado_liquido", conta: "RESULTADO", descricao: "Resultado Líquido do Período",
    tipo: "resultado", nivel: 0,
    valor: receita - despesa, debito: 0, credito: 0, saldo: receita - despesa,
    qtd_lancamentos: 0, origem_lancamento_ids: [],
  });

  if (dreRows.length > 0) {
    const { error } = await supabase.from("dre_consolidado").insert(dreRows);
    if (error) throw new Error(`insert dre_consolidado: ${error.message}`);
  }
  return { rows: dreRows.length, receita, despesa, resultado: receita - despesa };
}

// ============= 7c. Fluxo de Caixa Consolidado =============
async function buildFluxoCaixa(runId: string, companyId: string, rmaId: string | null, year: number, month: number) {
  await supabase.from("fluxo_caixa_consolidado")
    .delete().eq("company_id", companyId).eq("ano", year).eq("mes", month);

  // Heurística: usa lancamentos com categoria PIX/COMPROVANTE/BOLETO/BANK_RECEIPT (caixa real)
  const { data: lancs } = await supabase
    .from("lancamentos")
    .select("id, descricao_padronizada, valor, debito, credito, saldo, categoria, grupo, subgrupo, confianca_ocr, confianca_ia, confianca_mapeamento")
    .eq("company_id", companyId).eq("ano", year).eq("mes", month)
    .in("categoria", ["PIX", "COMPROVANTE", "BOLETO", "BANK_RECEIPT", "EXTRATO_BANCARIO"]);

  // Classificação simplificada por subgrupo/grupo
  const buckets = new Map<string, { entradas: number; saidas: number; saldo: number; ids: string[]; conf: number[]; descricao: string }>();
  (lancs || []).forEach((l) => {
    const categoria = (l.grupo || "operacional").toLowerCase().includes("invest") ? "investimento"
      : (l.grupo || "operacional").toLowerCase().includes("financ") ? "financiamento"
      : "operacional";
    const key = `${categoria}::${l.subgrupo || l.descricao_padronizada || "geral"}`;
    const cur = buckets.get(key) || { entradas: 0, saidas: 0, saldo: 0, ids: [], conf: [], descricao: l.descricao_padronizada || "Operações" };
    cur.entradas += Number(l.debito || 0);
    cur.saidas += Number(l.credito || 0);
    cur.saldo += Number(l.saldo || l.valor || 0);
    cur.ids.push(l.id);
    cur.conf.push(0.4 * Number(l.confianca_ocr || 0) + 0.3 * Number(l.confianca_ia || 0) + 0.3 * Number(l.confianca_mapeamento || 0));
    buckets.set(key, cur);
  });

  const fcxRows: any[] = [];
  for (const [key, agg] of buckets.entries()) {
    const [categoria, subcategoria] = key.split("::");
    const conf = agg.conf.length > 0 ? agg.conf.reduce((a, b) => a + b, 0) / agg.conf.length : null;
    fcxRows.push({
      company_id: companyId, rma_id: rmaId, ano: year, mes: month, run_id: runId,
      categoria, subcategoria, descricao: agg.descricao,
      tipo: agg.entradas >= agg.saidas ? "entrada" : "saida",
      valor: agg.saldo, entradas: agg.entradas, saidas: agg.saidas, saldo: agg.saldo,
      qtd_lancamentos: agg.ids.length, origem_lancamento_ids: agg.ids,
      confianca_global: conf != null ? Number(conf.toFixed(4)) : null,
    });
  }

  if (fcxRows.length > 0) {
    const { error } = await supabase.from("fluxo_caixa_consolidado").insert(fcxRows);
    if (error) throw new Error(`insert fluxo_caixa_consolidado: ${error.message}`);
  }
  return fcxRows.length;
}

// ============= 7d. Período Status (timeline + status do mês) =============
async function updatePeriodStatus(
  runId: string,
  companyId: string,
  rmaId: string | null,
  year: number,
  month: number,
  totals: { docs: number; lanc: number; contas: number; conflitos: number; confianca: number | null; reconciled: boolean },
) {
  const status = totals.conflitos > 0
    ? "em_validacao"
    : (totals.reconciled && totals.docs > 0 ? "completo" : "parcial");

  const timelineEntry = {
    at: new Date().toISOString(),
    run_id: runId,
    docs: totals.docs,
    lanc: totals.lanc,
    contas: totals.contas,
    conflitos: totals.conflitos,
    confianca: totals.confianca,
    status,
  };

  const { data: existing } = await supabase
    .from("balancete_periods")
    .select("id, timeline")
    .eq("company_id", companyId).eq("ano", year).eq("mes", month)
    .maybeSingle();

  const baseFields = {
    company_id: companyId, rma_id: rmaId, ano: year, mes: month,
    status,
    total_documentos: totals.docs,
    total_lancamentos: totals.lanc,
    total_contas: totals.contas,
    conflitos_pendentes: totals.conflitos,
    confianca_media: totals.confianca,
    ultima_carga_at: new Date().toISOString(),
    ultimo_run_id: runId,
  };

  if (existing) {
    const newTimeline = [...(Array.isArray(existing.timeline) ? existing.timeline : []), timelineEntry].slice(-50);
    await supabase.from("balancete_periods")
      .update({ ...baseFields, timeline: newTimeline })
      .eq("id", existing.id);
  } else {
    await supabase.from("balancete_periods")
      .insert({ ...baseFields, timeline: [timelineEntry] });
  }
}


// ============= 8. Reconciliação contábil + persistência em balancete_validacoes =============
async function reconcile(runId: string, companyId: string, year: number, month: number) {
  const { data } = await supabase
    .from("balancete_consolidado")
    .select("conta, valor, saldo, tipo, confianca_global")
    .eq("company_id", companyId)
    .eq("ano", year)
    .eq("mes", month);

  let ativo = 0, passivo = 0, pl = 0;
  const confs: number[] = [];
  (data || []).forEach((r) => {
    const v = Number(r.saldo ?? r.valor ?? 0);
    if (r.tipo === "ativo") ativo += v;
    else if (r.tipo === "passivo") passivo += v;
    else if (r.tipo === "patrimonio_liquido") pl += v;
    if (r.confianca_global != null) confs.push(Number(r.confianca_global));
  });
  const diferenca = ativo - (passivo + pl);
  const tolerance = Math.max(1, Math.abs(ativo) * 0.001);
  const passed = Math.abs(diferenca) < tolerance;
  const confianca_global = confs.length > 0 ? Number((confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(4)) : null;

  // Alertas estruturados
  const alertas: any[] = [];
  if (!passed) alertas.push({ tipo: "balanco_nao_fecha", severidade: "alta", diferenca, tolerance, mensagem: `Ativo (${ativo.toFixed(2)}) ≠ Passivo+PL (${(passivo + pl).toFixed(2)})` });
  if (confianca_global != null && confianca_global < 0.6) alertas.push({ tipo: "confianca_baixa", severidade: "media", confianca_global, mensagem: "Confiança global do balancete abaixo de 60%" });
  if ((data || []).length === 0) alertas.push({ tipo: "sem_dados", severidade: "alta", mensagem: "Nenhuma conta consolidada para o período" });

  // Persiste validação (idempotente: delete + insert)
  await supabase.from("balancete_validacoes")
    .delete().eq("company_id", companyId).eq("ano", year).eq("mes", month);
  await supabase.from("balancete_validacoes").insert({
    company_id: companyId, run_id: runId, ano: year, mes: month,
    ativo_total: ativo, passivo_total: passivo, pl_total: pl,
    diferenca, reconciled: passed, confianca_global,
    alertas, details: { tolerance, contas_avaliadas: (data || []).length },
  });

  return { ativo, passivo, patrimonio_liquido: pl, diff: diferenca, passed, confianca_global, alertas };
}

// ============= Background pipeline =============
async function runPipeline(runId: string, req: BuildRequest) {
  const startedAt = Date.now();
  try {
    await updateRun(runId, { status: "running", started_at: new Date().toISOString(), progress: 5 });
    await appendLog(runId, `Iniciando build company=${req.company_id} ${req.month}/${req.year}`);

    // 1. Lista docs (incremental por padrão; force=true reprocessa tudo)
    const incremental = !req.force;
    const { rmaId, docs: allDocs, skippedUnchanged } = await listMonthDocuments(req.rma_id, req.company_id, {
      incremental,
      year: req.year,
      month: req.month,
    });

    // 1b. Se for build de período específico (sub-run de backfill ou run normal),
    //     FILTRA por período detectado no nome do arquivo, mantendo os indefinidos.
    let docs = (req.year && req.month)
      ? allDocs.filter((d) => {
        const p = detectPeriodFromName(d.file_name || "");
        return !p || (p.year === req.year && p.month === req.month);
      })
      : allDocs;

    // 1c. Modo CONSOLIDATE_ONLY: processa SOMENTE docs que já possuem ai_extractions.completed.
    //     Evita disparar OCR/IA novamente (e cascatas de rate-limit). Ideal para backfill.
    if (req.consolidate_only && docs.length > 0) {
      const docIds = docs.map((d) => d.id);
      const { data: readyExts } = await supabase
        .from("ai_extractions")
        .select("document_id")
        .in("document_id", docIds)
        .eq("status", "completed");
      const readySet = new Set((readyExts || []).map((e) => e.document_id));
      const before = docs.length;
      docs = docs.filter((d) => readySet.has(d.id));
      await appendLog(runId, `consolidate_only=true · ${docs.length}/${before} doc(s) com extração pronta`);
    }

    await updateRun(runId, { rma_id: rmaId, files_total: docs.length, folders_total: 1, progress: 10 });
    await appendLog(
      runId,
      `RMA=${rmaId} · docs a processar: ${docs.length}/${allDocs.length} (filtro período ${req.month}/${req.year})` +
      (incremental && skippedUnchanged > 0 ? ` (${skippedUnchanged} ignorados — sem alteração)` : ""),
    );
    if (docs.length === 0) {
      await updateRun(runId, { status: "success", finished_at: new Date().toISOString(), progress: 100, duration_ms: Date.now() - startedAt });
      return;
    }

    // 2. Carrega COA + cache uma vez
    const templateName = req.template_name || "XPT_BR_PADRAO_V1";
    const coa = await loadChartOfAccounts(req.company_id, templateName);
    const cache = await loadCache(req.company_id);
    await appendLog(runId, `COA carregado: ${coa.length} contas analíticas · cache: ${cache.size} entradas`);

    // 3. Modo evolutivo: NUNCA deletamos lançamentos.
    //    `force=true` agora apenas re-extrai documentos (re-roda IA), mas a soma é cumulativa.
    //    Para deduplicação use a tabela balancete_versions/conflicts.
    if (req.force) {
      await appendLog(runId, "force=true → re-extração de documentos (lançamentos preservados; merge cumulativo)");
    }

    // 4. Processa cada doc
    let processed = 0, skipped = 0, lancCount = 0;
    const allRows: Parameters<typeof persistLancamentos>[0] = [];

    for (const doc of docs) {
      try {
        // 4.1 OCR
        const ocr = await ensureOcr(doc.id, rmaId!);
        if (!ocr || !ocr.text) {
          skipped++;
          await appendLog(runId, `SKIP ${doc.file_name}: sem OCR`);
          continue;
        }
        // 4.2 Extração IA (com Smart Prompt opt-in)
        const ext = await ensureExtraction(
          doc.id,
          rmaId!,
          ocr.text,
          ocr.confidence,
          req.use_smart_prompt
            ? { company_id: req.company_id, empresa: req.empresa_nome, periodo: `${String(req.month).padStart(2, "0")}/${req.year}` }
            : undefined,
        );
        if (!ext?.extracted_data) {
          skipped++;
          await appendLog(runId, `SKIP ${doc.file_name}: sem extração`);
          continue;
        }
        // 4.3 Linhas de lançamento
        const lines = extractLines(ext.extracted_data, ext.classe || "OUTRO");
        if (lines.length === 0) {
          skipped++;
          await appendLog(runId, `SKIP ${doc.file_name}: nenhuma linha extraída (classe=${ext.classe})`);
          continue;
        }
        // 4.4 Mapeia cada linha
        for (const line of lines) {
          const match = matchAccount(line.descricao, line.conta_sugerida, coa, cache);
          allRows.push({
            line, match,
            documentId: doc.id,
            extractionId: ext.id,
            fileName: doc.file_name,
            classe: ext.classe || "OUTRO",
            ocrConf: ocr.confidence,
            iaConf: Number(ext.final_confidence ?? 0.7),
          });
          // 4.5 Loop de aprendizado: linhas em fallback viram "erro recorrente"
          if (req.use_smart_prompt && match.source === "fallback") {
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/prompt-builder?action=erro`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
                body: JSON.stringify({
                  classe: "balancete",
                  erro: `Descrição não classificada: "${line.descricao}"`,
                  correcao: "Mapear para conta analítica do plano de contas (revisar e adicionar a prompt_learning).",
                  impacto: "medium",
                }),
              });
            } catch { /* non-fatal */ }
          }
        }
        processed++;
        const prog = 10 + Math.round((processed / docs.length) * 70);
        await updateRun(runId, { files_processed: processed, files_skipped: skipped, progress: prog });
      } catch (e) {
        skipped++;
        await appendLog(runId, `ERRO ${doc.file_name}: ${(e as Error).message}`);
      }
    }

    // 5. Persiste em massa
    lancCount = await persistLancamentos(allRows, req.company_id, rmaId, req.year, req.month);
    await updateRun(runId, { lancamentos_criados: lancCount, progress: 85 });
    await appendLog(runId, `Lançamentos persistidos: ${lancCount}`);

    // 6. Consolida balancete (modo evolutivo: UPSERT + versões + conflitos)
    const consResult = await consolidate(runId, req.company_id, rmaId, req.year, req.month);
    await updateRun(runId, { progress: 88 });
    await appendLog(runId, `Balancete: ${consResult.contas} contas · ${consResult.versoes} versões gravadas · ${consResult.conflitos} conflitos detectados`);

    // 6b. DRE (derivado do balancete cumulativo)
    const dre = await buildDRE(runId, req.company_id, rmaId, req.year, req.month);
    await updateRun(runId, { progress: 92 });
    await appendLog(runId, `DRE: ${dre.rows} linhas · receita=${dre.receita.toFixed(2)} despesa=${dre.despesa.toFixed(2)} resultado=${dre.resultado.toFixed(2)}`);

    // 6c. Fluxo de Caixa (derivado do balancete cumulativo)
    const fcx = await buildFluxoCaixa(runId, req.company_id, rmaId, req.year, req.month);
    await updateRun(runId, { progress: 95 });
    await appendLog(runId, `Fluxo de Caixa: ${fcx} linhas`);

    // 7. Reconcilia + grava balancete_validacoes
    const recon = await reconcile(runId, req.company_id, req.year, req.month);
    await appendLog(runId, `Reconciliação: A=${recon.ativo.toFixed(2)} P=${recon.passivo.toFixed(2)} PL=${recon.patrimonio_liquido.toFixed(2)} diff=${recon.diff.toFixed(2)} passed=${recon.passed} confianca=${recon.confianca_global ?? "n/a"}`);

    // 8. Marca consolidação como reconciliada
    await supabase.from("balancete_consolidado")
      .update({ reconciled: recon.passed })
      .eq("company_id", req.company_id).eq("ano", req.year).eq("mes", req.month);

    // 9. Atualiza status do período (timeline + parcial/completo/em_validacao)
    await updatePeriodStatus(runId, req.company_id, rmaId, req.year, req.month, {
      docs: processed,
      lanc: lancCount,
      contas: consResult.contas,
      conflitos: consResult.conflitos,
      confianca: recon.confianca_global,
      reconciled: recon.passed,
    });
    await appendLog(runId, `Período ${req.month}/${req.year} atualizado · status=${consResult.conflitos > 0 ? "em_validacao" : (recon.passed ? "completo" : "parcial")}`);

    await updateRun(runId, {
      status: "success",
      progress: 100,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      reconciliation_passed: recon.passed,
      reconciliation_report: recon,
      alerts: [...recon.alertas, ...(consResult.conflitos > 0 ? [{ tipo: "conflitos_pendentes", count: consResult.conflitos, severidade: "media" }] : [])],
    });

    // 10. Auto-trigger: deriva BS e DRE para Balanço/P&L tabs (Fase 2)
    try {
      await appendLog(runId, "Auto-trigger: derivando BS e DRE (bs-pnl-build)…");
      const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/bs-pnl-build`;
      const resp = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ company_id: req.company_id, ano: req.year, mes: req.month }),
      });
      const j = await resp.json().catch(() => ({}));
      await appendLog(runId, `BS/DRE derivados: bs=${j?.bs ?? "?"} dre=${j?.dre ?? "?"}`);
    } catch (autoErr) {
      await appendLog(runId, `Aviso: bs-pnl-build falhou (não-fatal): ${(autoErr as Error).message}`);
    }
  } catch (e) {
    console.error("balancete-build pipeline failed", e);
    await updateRun(runId, {
      status: "failed",
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      error_message: (e as Error).message,
    });
    await appendLog(runId, `FATAL: ${(e as Error).message}`);
  }
}

// ============= Backfill: lista extrações órfãs (sem lançamento) =============
async function listOrphanExtractions(companyId: string, rmaId?: string | null) {
  let effectiveRmaId = rmaId;
  if (!effectiveRmaId) {
    const { data: c } = await supabase.from("companies").select("rma_id").eq("id", companyId).single();
    effectiveRmaId = c?.rma_id || undefined;
  }

  // Lista pipeline_documents do RMA + extrações completed
  const { data: docs } = await supabase
    .from("pipeline_documents")
    .select("id, file_name, rma_id")
    .eq("rma_id", effectiveRmaId);
  const docIds = (docs || []).map((d) => d.id);
  if (docIds.length === 0) return { orphans: [], byPeriod: {}, rmaId: effectiveRmaId };

  const { data: exts } = await supabase
    .from("ai_extractions")
    .select("id, document_id, classe, status, extracted_data")
    .in("document_id", docIds)
    .eq("status", "completed");

  // Para cada doc, verifica se já existe lancamento
  const { data: lancs } = await supabase
    .from("lancamentos")
    .select("document_id")
    .eq("company_id", companyId)
    .in("document_id", docIds);
  const lancDocIds = new Set((lancs || []).map((l) => l.document_id));

  const docMap = new Map((docs || []).map((d) => [d.id, d]));
  const orphans: any[] = [];
  const byPeriod: Record<string, { count: number; files: string[] }> = {};

  for (const ext of (exts || [])) {
    if (lancDocIds.has(ext.document_id)) continue; // já consolidado
    const doc = docMap.get(ext.document_id);
    if (!doc) continue;
    const period = detectPeriodFromName(doc.file_name);
    const periodKey = period ? `${String(period.month).padStart(2, "0")}/${period.year}` : "indefinido";
    orphans.push({
      extraction_id: ext.id,
      document_id: ext.document_id,
      file_name: doc.file_name,
      classe: ext.classe,
      period,
      period_key: periodKey,
    });
    if (!byPeriod[periodKey]) byPeriod[periodKey] = { count: 0, files: [] };
    byPeriod[periodKey].count++;
    if (byPeriod[periodKey].files.length < 5) byPeriod[periodKey].files.push(doc.file_name);
  }

  return { orphans, byPeriod, rmaId: effectiveRmaId };
}

// ============= HTTP handler =============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action");

      // Lista órfãs: ?action=orphans&company_id=...
      if (action === "orphans") {
        const companyId = url.searchParams.get("company_id");
        if (!companyId) return new Response(JSON.stringify({ error: "company_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const result = await listOrphanExtractions(companyId, url.searchParams.get("rma_id"));
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const runId = url.searchParams.get("run_id");
      if (!runId) return new Response(JSON.stringify({ error: "run_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data, error } = await supabase.from("balancete_runs").select("*").eq("id", runId).single();
      if (error || !data) return new Response(JSON.stringify({ error: "run não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = (await req.json()) as BuildRequest;
    if (!body.company_id) {
      return new Response(JSON.stringify({ error: "company_id é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== Modo BACKFILL ou AUTO_PERIOD: agrupa órfãs por período detectado e cria 1 run por período =====
    if (body.action === "backfill" || body.auto_period) {
      const { orphans, byPeriod, rmaId } = await listOrphanExtractions(body.company_id, body.rma_id);
      const periods = Object.keys(byPeriod).filter((k) => k !== "indefinido");
      if (periods.length === 0) {
        return new Response(JSON.stringify({
          message: "Nenhuma extração órfã com período identificável",
          orphans_total: orphans.length,
          undefined_count: byPeriod["indefinido"]?.count ?? 0,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const runs: any[] = [];
      for (const periodKey of periods) {
        const [mm, yyyy] = periodKey.split("/").map(Number);

        // Lock anti-concorrência: cancela runs running do mesmo período antes de criar nova
        await supabase.from("balancete_runs")
          .update({ status: "failed", finished_at: new Date().toISOString(), error_message: "cancelado por nova execução" })
          .eq("company_id", body.company_id).eq("ano", yyyy).eq("mes", mm).eq("status", "running");

        const { data: run, error: runErr } = await supabase.from("balancete_runs").insert({
          company_id: body.company_id,
          rma_id: rmaId || null,
          ano: yyyy, mes: mm,
          status: "pending", progress: 0, log: [{ t: new Date().toISOString(), msg: `[backfill consolidate_only] ${byPeriod[periodKey].count} extração(ões) prontas detectada(s)` }],
        }).select("id").single();
        if (runErr || !run) continue;
        runs.push({ run_id: run.id, period: periodKey, docs: byPeriod[periodKey].count });

        // IMPORTANTE: consolidate_only=true → reaproveita as extrações já completed,
        // sem disparar OCR/IA (evita cascata de rate-limit no Vision).
        const subReq: BuildRequest = { ...body, year: yyyy, month: mm, force: true, auto_period: false, action: "build", consolidate_only: true };
        if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
          EdgeRuntime.waitUntil(runPipeline(run.id, subReq));
        } else {
          runPipeline(run.id, subReq).catch((e) => console.error("backfill detached failed", e));
        }
      }

      return new Response(JSON.stringify({
        mode: "auto_period",
        periods_detected: periods.length,
        runs,
        undefined_count: byPeriod["indefinido"]?.count ?? 0,
        orphans_total: orphans.length,
      }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== Modo BUILD clássico (year/month obrigatórios) =====
    if (!body.year || !body.month) {
      return new Response(JSON.stringify({ error: "year, month são obrigatórios (ou use auto_period:true)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.month < 1 || body.month > 12) {
      return new Response(JSON.stringify({ error: "month deve ser 1-12" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: run, error: runErr } = await supabase.from("balancete_runs").insert({
      company_id: body.company_id,
      rma_id: body.rma_id || null,
      ano: body.year,
      mes: body.month,
      status: "pending",
      progress: 0,
      log: [],
    }).select("id").single();
    if (runErr || !run) throw new Error(`criar run: ${runErr?.message}`);

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(runPipeline(run.id, body));
    } else {
      runPipeline(run.id, body).catch((e) => console.error("runPipeline detached failed", e));
    }

    return new Response(JSON.stringify({
      run_id: run.id,
      status: "pending",
      poll_url: `/balancete-build?run_id=${run.id}`,
    }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("balancete-build handler error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
