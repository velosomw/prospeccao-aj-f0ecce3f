// Cross-Document Validator 2.0 — Fase 3
// Valida coerência entre múltiplos documentos do mesmo RMA/empresa/período.
//
// Regras aplicadas:
//  1. CNPJ — todos os docs do RMA devem ter o mesmo CNPJ
//  2. Período — datas de competência devem coincidir (mês/ano)
//  3. Saldo balancete — Ativo = Passivo + PL (tolerância 0.5%)
//  4. DRE vs Balancete — resultado do exercício DRE ≈ variação do PL no balancete
//  5. PIX/extrato bancário — total de entradas/saídas ≈ movimento do balancete em "Caixa/Bancos"
//  6. Cross-doc duplication — mesmo lançamento (data+valor+descrição) em 2+ documentos distintos
//
// Saída: { score: 0..1, issues: [{ rule, severity, message, refs }], passed: boolean }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface CrossIssue {
  rule: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  refs?: Record<string, unknown>;
}

export interface CrossResult {
  score: number;
  passed: boolean;
  checked: number;
  issues: CrossIssue[];
  summary: Record<string, unknown>;
}

async function sb(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return [];
  return (await r.json()) ?? [];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D+/g, "");

const pctDiff = (a: number, b: number) => {
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 0;
  return Math.abs(a - b) / max;
};

/** Penalidades por severidade. */
const SEV_W: Record<CrossIssue["severity"], number> = {
  low: 0.05,
  medium: 0.15,
  high: 0.3,
  critical: 0.5,
};

export interface CrossInput {
  rma_id?: string | null;
  company_id?: string | null;
  ano?: number | null;
  mes?: number | null;
}

export async function runCrossValidation(input: CrossInput): Promise<CrossResult> {
  const issues: CrossIssue[] = [];
  const summary: Record<string, unknown> = {};

  // 1. Carrega extrações do escopo
  const filters: string[] = ["status=eq.completed"];
  if (input.rma_id) filters.push(`rma_id=eq.${encodeURIComponent(input.rma_id)}`);
  const extractions: any[] = await sb(
    `/ai_extractions?select=id,document_id,classe,agent,extracted_data,final_confidence,rma_id&${filters.join("&")}&limit=500`,
  );

  if (extractions.length === 0) {
    return { score: 1, passed: true, checked: 0, issues: [], summary: { note: "sem documentos" } };
  }

  // === Regra 1: CNPJ uniforme ===
  const cnpjs = new Set<string>();
  for (const ex of extractions) {
    const c = onlyDigits(
      ex.extracted_data?.cnpj ??
        ex.extracted_data?.empresa?.cnpj ??
        ex.extracted_data?.cabecalho?.cnpj,
    );
    if (c && c.length === 14) cnpjs.add(c);
  }
  if (cnpjs.size > 1) {
    issues.push({
      rule: "cnpj_consistency",
      severity: "critical",
      message: `Foram detectados ${cnpjs.size} CNPJs distintos no mesmo RMA.`,
      refs: { cnpjs: [...cnpjs] },
    });
  }
  summary.cnpjs_unicos = cnpjs.size;

  // === Regra 2: Período coerente ===
  if (input.ano && input.mes) {
    let mismatched = 0;
    for (const ex of extractions) {
      const a = Number(ex.extracted_data?.ano ?? ex.extracted_data?.competencia?.ano);
      const m = Number(ex.extracted_data?.mes ?? ex.extracted_data?.competencia?.mes);
      if (a && m && (a !== input.ano || m !== input.mes)) mismatched++;
    }
    if (mismatched > 0) {
      issues.push({
        rule: "period_consistency",
        severity: "medium",
        message: `${mismatched} documento(s) com competência diferente do período esperado ${input.mes}/${input.ano}.`,
      });
    }
    summary.periodo_divergente = mismatched;
  }

  // === Regra 3: Balancete — Ativo = Passivo + PL ===
  let bal: any[] = [];
  if (input.company_id && input.ano && input.mes) {
    bal = await sb(
      `/balancete_consolidado?select=conta,tipo,grupo,saldo,valor&company_id=eq.${input.company_id}&ano=eq.${input.ano}&mes=eq.${input.mes}&limit=2000`,
    );
  }
  if (bal.length > 0) {
    const sumByTipo = (t: string) =>
      bal.filter((r) => String(r.tipo).toLowerCase() === t).reduce((a, r) => a + num(r.saldo || r.valor), 0);
    const ativo = sumByTipo("ativo");
    const passivo = sumByTipo("passivo");
    const pl = sumByTipo("patrimonio_liquido") || sumByTipo("pl") || sumByTipo("patrimônio líquido");
    const diff = pctDiff(ativo, passivo + pl);
    summary.equacao_contabil = { ativo, passivo, pl, diff };
    if (diff > 0.005) {
      issues.push({
        rule: "balance_equation",
        severity: diff > 0.05 ? "critical" : "high",
        message: `Equação contábil não fecha: |Ativo − (Passivo+PL)| = ${(diff * 100).toFixed(2)}%`,
        refs: { ativo, passivo, pl },
      });
    }
  }

  // === Regra 4: DRE vs PL (variação) ===
  if (input.company_id && input.ano && input.mes) {
    const dre: any[] = await sb(
      `/dre_consolidado?select=tipo,grupo,valor,saldo&company_id=eq.${input.company_id}&ano=eq.${input.ano}&mes=eq.${input.mes}&limit=2000`,
    );
    if (dre.length > 0) {
      const lucro = dre
        .filter((r) => /resultado|lucro|prejuizo/i.test(String(r.grupo) + String(r.tipo)))
        .reduce((a, r) => a + num(r.valor || r.saldo), 0);
      summary.dre_resultado = lucro;
      // Apenas registra; comparação com variação de PL exige período anterior — fica como informativo.
    }
  }

  // === Regra 5: Caixa/Bancos vs Fluxo de caixa ===
  if (input.company_id && input.ano && input.mes) {
    const fluxo: any[] = await sb(
      `/fluxo_caixa_consolidado?select=entradas,saidas,saldo&company_id=eq.${input.company_id}&ano=eq.${input.ano}&mes=eq.${input.mes}&limit=500`,
    );
    if (fluxo.length > 0 && bal.length > 0) {
      const movFluxo = fluxo.reduce((a, r) => a + (num(r.entradas) - num(r.saidas)), 0);
      const caixa = bal
        .filter((r) => /caixa|banco|disponi/i.test(String(r.conta)))
        .reduce((a, r) => a + num(r.saldo || r.valor), 0);
      summary.caixa = { saldo_balancete: caixa, mov_fluxo: movFluxo };
      const diff = pctDiff(caixa, movFluxo);
      if (caixa !== 0 && movFluxo !== 0 && diff > 0.1) {
        issues.push({
          rule: "cash_vs_flow",
          severity: "medium",
          message: `Saldo de caixa do balancete diverge do fluxo de caixa em ${(diff * 100).toFixed(1)}%.`,
          refs: { caixa, movFluxo },
        });
      }
    }
  }

  // === Regra 6: Duplicação cross-doc ===
  if (input.company_id) {
    const lan: any[] = await sb(
      `/lancamentos?select=id,data_documento,valor,descricao_original,document_id&company_id=eq.${input.company_id}&limit=5000`,
    );
    const map = new Map<string, Set<string>>();
    for (const l of lan) {
      const key = `${l.data_documento ?? ""}|${num(l.valor).toFixed(2)}|${(l.descricao_original ?? "").slice(0, 40).toLowerCase()}`;
      if (!map.has(key)) map.set(key, new Set());
      if (l.document_id) map.get(key)!.add(l.document_id);
    }
    let dups = 0;
    for (const [, docs] of map) if (docs.size > 1) dups++;
    if (dups > 0) {
      issues.push({
        rule: "cross_doc_duplicates",
        severity: dups > 10 ? "high" : "medium",
        message: `${dups} lançamento(s) potencialmente duplicado(s) entre documentos distintos.`,
      });
    }
    summary.duplicados_cross_doc = dups;
  }

  // === Score final ===
  let penalty = 0;
  for (const i of issues) penalty += SEV_W[i.severity];
  const score = Math.max(0, 1 - penalty);
  const passed = !issues.some((i) => i.severity === "critical") && score >= 0.7;

  return {
    score: Number(score.toFixed(3)),
    passed,
    checked: extractions.length,
    issues,
    summary,
  };
}
