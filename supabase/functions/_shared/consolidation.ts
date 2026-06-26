// Consolidation engine — deterministic indicators + report payload
// ----------------------------------------------------------------
// Pure functions that turn structured extracted_data (per file/classe)
// into financial indicators, Kanitz score, RJ risk score and a ready-to-use
// report payload. NO external calls, NO LLM. Safe to run inline.
//
// Inputs:
//   - classe: ai_extractions.classe ("BALANCETE" | "DRE" | "DFC" | "RAZAO" | ...)
//   - extracted_data: jsonb produced by the LLM agent
//   - context (optional): empresa, periodo, rma_id
//
// Output: { indicadores, kanitz, score_rj, alertas, relatorio }

export type Classe =
  | "BALANCETE" | "BALANCO" | "DRE" | "DFC" | "RAZAO"
  | "BOLETO" | "COMPROVANTE" | "BANK_RECEIPT" | "NF" | string;

export interface ConsolidationInput {
  classe: Classe;
  extracted_data: Record<string, any>;
  context?: {
    empresa?: string;
    rma_id?: string;
    ano?: number;
    mes?: number;
  };
}

export interface Indicadores {
  liquidezCorrente: number;
  liquidezSeca: number;
  liquidezGeral: number;
  liquidezImediata: number;
  endividamentoTotal: number;
  composicaoEndividamento: number;
  imobilizacaoPL: number;
  giroAtivo: number;
  margemLiquida: number;
  margemOperacional: number;
  roe: number;
  roa: number;
  ebitdaMargem: number;
}

export interface Kanitz {
  fatorInsolvencia: number;
  classificacao: "solvente" | "penumbra" | "insolvente";
  componentes: { rpl: number; lg: number; ls: number; lc: number; ge: number };
}

export interface ScoreRJ {
  score: number; // 0..100, maior = mais risco
  classificacao: "Saudável" | "Atenção" | "Alto Risco" | "Forte Indicativo de RJ";
  componentes: Record<string, number>;
}

export interface Alerta {
  titulo: string;
  descricao: string;
  severidade: "baixa" | "media" | "alta" | "critica";
}

export interface ConsolidationResult {
  classe: Classe;
  computed_at: string;
  empresa?: string;
  periodo?: { ano?: number; mes?: number };
  indicadores: Indicadores | null;
  kanitz: Kanitz | null;
  score_rj: ScoreRJ | null;
  alertas: Alerta[];
  relatorio: {
    titulo: string;
    sumario: string;
    blocos: Array<{ tipo: string; titulo: string; conteudo: any }>;
  };
  raw_metrics: Record<string, number>;
  source_fields: string[];
}

// ───────────── helpers ─────────────
const num = (v: any): number => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// Try multiple aliases for a metric
function pick(d: Record<string, any>, keys: string[]): number {
  for (const k of keys) {
    const parts = k.split(".");
    let cur: any = d;
    for (const p of parts) cur = cur?.[p];
    if (cur != null && cur !== "") return num(cur);
  }
  return 0;
}

// ───────────── indicators ─────────────
function buildIndicadores(m: Record<string, number>): Indicadores {
  const {
    ativo_total, ativo_circulante, ativo_nao_circulante,
    estoques, disponibilidades, realizavel_lp,
    passivo_total, passivo_circulante, passivo_nao_circulante,
    pl, receita_liquida, lucro_bruto, lucro_operacional,
    lucro_liquido, ebitda,
  } = m;

  return {
    liquidezCorrente: round(safeDiv(ativo_circulante, passivo_circulante)),
    liquidezSeca: round(safeDiv(ativo_circulante - estoques, passivo_circulante)),
    liquidezGeral: round(safeDiv(ativo_circulante + realizavel_lp, passivo_circulante + passivo_nao_circulante)),
    liquidezImediata: round(safeDiv(disponibilidades, passivo_circulante)),
    endividamentoTotal: round(safeDiv(passivo_circulante + passivo_nao_circulante, ativo_total)),
    composicaoEndividamento: round(safeDiv(passivo_circulante, passivo_circulante + passivo_nao_circulante)),
    imobilizacaoPL: round(safeDiv(ativo_nao_circulante, pl)),
    giroAtivo: round(safeDiv(receita_liquida, ativo_total)),
    margemLiquida: round(safeDiv(lucro_liquido, receita_liquida)),
    margemOperacional: round(safeDiv(lucro_operacional, receita_liquida)),
    roe: round(safeDiv(lucro_liquido, pl)),
    roa: round(safeDiv(lucro_liquido, ativo_total)),
    ebitdaMargem: round(safeDiv(ebitda, receita_liquida)),
  };
}

// ───────────── Kanitz ─────────────
function buildKanitz(m: Record<string, number>): Kanitz {
  const { lucro_liquido, pl, ativo_circulante, realizavel_lp,
    passivo_circulante, passivo_nao_circulante, estoques } = m;

  const X1 = safeDiv(lucro_liquido, pl);
  const X2 = safeDiv(ativo_circulante + realizavel_lp, passivo_circulante + passivo_nao_circulante);
  const X3 = safeDiv(ativo_circulante - estoques, passivo_circulante);
  const X4 = safeDiv(ativo_circulante, passivo_circulante);
  const X5 = -safeDiv(passivo_circulante + passivo_nao_circulante, pl);

  const FI = round(0.05 * X1 + 1.65 * X2 + 3.55 * X3 - 1.06 * X4 - 0.33 * X5, 3);
  const classificacao: Kanitz["classificacao"] =
    FI >= 0 ? "solvente" : FI <= -3 ? "insolvente" : "penumbra";

  return {
    fatorInsolvencia: FI,
    classificacao,
    componentes: { rpl: round(X1), lg: round(X2), ls: round(X3), lc: round(X4), ge: round(X5) },
  };
}

// ───────────── BEx-RJ score ─────────────
function buildScoreRJ(ind: Indicadores, kanitz: Kanitz): ScoreRJ {
  // 0..100, weighted heuristic; higher = higher RJ risk
  const liqPenalty = Math.max(0, (1.0 - ind.liquidezCorrente)) * 25;
  const endivPenalty = Math.max(0, ind.endividamentoTotal - 0.6) * 60;
  const margemPenalty = Math.max(0, -ind.margemLiquida) * 40;
  const kanitzPenalty = kanitz.fatorInsolvencia >= 0 ? 0 : Math.min(40, Math.abs(kanitz.fatorInsolvencia) * 10);

  const raw = liqPenalty + endivPenalty + margemPenalty + kanitzPenalty;
  const score = Math.min(100, Math.round(raw));
  const classificacao: ScoreRJ["classificacao"] =
    score < 30 ? "Saudável" : score < 55 ? "Atenção" : score < 80 ? "Alto Risco" : "Forte Indicativo de RJ";

  return {
    score,
    classificacao,
    componentes: {
      liqPenalty: round(liqPenalty, 2),
      endivPenalty: round(endivPenalty, 2),
      margemPenalty: round(margemPenalty, 2),
      kanitzPenalty: round(kanitzPenalty, 2),
    },
  };
}

// ───────────── alertas ─────────────
function buildAlertas(m: Record<string, number>, ind: Indicadores | null): Alerta[] {
  const a: Alerta[] = [];
  if (ind) {
    if (ind.liquidezCorrente > 0 && ind.liquidezCorrente < 1) {
      a.push({ titulo: "Liquidez corrente abaixo de 1", severidade: "alta",
        descricao: `LC=${ind.liquidezCorrente} indica dificuldade em honrar passivos de curto prazo.` });
    }
    if (ind.endividamentoTotal > 0.7) {
      a.push({ titulo: "Endividamento elevado", severidade: "alta",
        descricao: `Endividamento total=${(ind.endividamentoTotal * 100).toFixed(1)}% acima do limite saudável (70%).` });
    }
    if (ind.margemLiquida < 0) {
      a.push({ titulo: "Prejuízo no período", severidade: "critica",
        descricao: `Margem líquida negativa (${(ind.margemLiquida * 100).toFixed(1)}%).` });
    }
  }
  // sanity check on accounting equation
  if (m.ativo_total > 0 && m.passivo_total > 0 && m.pl !== 0) {
    const diff = Math.abs(m.ativo_total - (m.passivo_total + m.pl));
    const tol = m.ativo_total * 0.01;
    if (diff > tol) {
      a.push({
        titulo: "Quebra de equação contábil",
        severidade: "critica",
        descricao: `Ativo (${m.ativo_total}) ≠ Passivo+PL (${m.passivo_total + m.pl}). Diferença: ${round(diff, 2)}.`,
      });
    }
  }
  return a;
}

// ───────────── extract metrics from extracted_data ─────────────
function extractMetrics(input: ConsolidationInput): { metrics: Record<string, number>; usedFields: string[] } {
  const d = input.extracted_data || {};
  const used: string[] = [];
  const get = (canonical: string, aliases: string[]) => {
    const v = pick(d, aliases);
    if (v !== 0) used.push(canonical);
    return v;
  };

  const metrics: Record<string, number> = {
    ativo_total: get("ativo_total", ["ativo_total", "balanco.ativo_total", "ativos.total"]),
    ativo_circulante: get("ativo_circulante", ["ativo_circulante", "balanco.ativo_circulante", "ac"]),
    ativo_nao_circulante: get("ativo_nao_circulante", ["ativo_nao_circulante", "balanco.ativo_nao_circulante", "anc"]),
    estoques: get("estoques", ["estoques", "balanco.estoques"]),
    disponibilidades: get("disponibilidades", ["disponibilidades", "caixa", "balanco.disponibilidades"]),
    realizavel_lp: get("realizavel_lp", ["realizavel_lp", "rlp", "balanco.realizavel_lp"]),
    passivo_total: get("passivo_total", ["passivo_total", "balanco.passivo_total"]),
    passivo_circulante: get("passivo_circulante", ["passivo_circulante", "pc", "balanco.passivo_circulante"]),
    passivo_nao_circulante: get("passivo_nao_circulante", ["passivo_nao_circulante", "pnc", "elp", "balanco.passivo_nao_circulante"]),
    pl: get("pl", ["patrimonio_liquido", "pl", "balanco.patrimonio_liquido"]),
    receita_bruta: get("receita_bruta", ["receita_bruta", "dre.receita_bruta"]),
    receita_liquida: get("receita_liquida", ["receita_liquida", "dre.receita_liquida"]),
    custos: get("custos", ["custos", "cmv", "dre.custos"]),
    despesas: get("despesas", ["despesas", "dre.despesas", "despesas_operacionais"]),
    lucro_bruto: get("lucro_bruto", ["lucro_bruto", "dre.lucro_bruto"]),
    lucro_operacional: get("lucro_operacional", ["lucro_operacional", "dre.lucro_operacional", "ebit"]),
    ebitda: get("ebitda", ["ebitda", "dre.ebitda"]),
    lucro_liquido: get("lucro_liquido", ["lucro_liquido", "dre.lucro_liquido"]),
    margem_liquida: get("margem_liquida", ["margem_liquida"]),
  };

  // Derivações: se faltar receita_liquida mas houver bruta - deduções, mantém bruta
  if (metrics.receita_liquida === 0 && metrics.receita_bruta > 0) {
    metrics.receita_liquida = metrics.receita_bruta;
  }
  if (metrics.lucro_operacional === 0 && metrics.lucro_liquido > 0) {
    metrics.lucro_operacional = metrics.lucro_liquido;
  }
  if (metrics.passivo_total === 0 && (metrics.passivo_circulante + metrics.passivo_nao_circulante) > 0) {
    metrics.passivo_total = metrics.passivo_circulante + metrics.passivo_nao_circulante;
  }
  if (metrics.ativo_total === 0 && (metrics.ativo_circulante + metrics.ativo_nao_circulante) > 0) {
    metrics.ativo_total = metrics.ativo_circulante + metrics.ativo_nao_circulante;
  }

  return { metrics, usedFields: used };
}

// ───────────── report payload ─────────────
function buildRelatorio(
  input: ConsolidationInput,
  ind: Indicadores | null,
  kanitz: Kanitz | null,
  score: ScoreRJ | null,
  alertas: Alerta[],
  metrics: Record<string, number>,
) {
  const periodo = input.context?.ano && input.context?.mes
    ? `${String(input.context.mes).padStart(2, "0")}/${input.context.ano}`
    : "—";
  const empresa = input.context?.empresa || "—";

  const blocos: Array<{ tipo: string; titulo: string; conteudo: any }> = [];

  if (ind) {
    blocos.push({ tipo: "indicadores", titulo: "Indicadores Financeiros", conteudo: ind });
  }
  if (kanitz) {
    blocos.push({ tipo: "kanitz", titulo: "Modelo de Insolvência (Kanitz)", conteudo: kanitz });
  }
  if (score) {
    blocos.push({ tipo: "score_rj", titulo: "Score BEx-RJ", conteudo: score });
  }
  if (alertas.length) {
    blocos.push({ tipo: "alertas", titulo: "Alertas Detectados", conteudo: alertas });
  }
  blocos.push({
    tipo: "metricas_brutas",
    titulo: "Métricas Brutas Consolidadas",
    conteudo: metrics,
  });

  const sumario = score
    ? `Empresa ${empresa} (${periodo}): score BEx-RJ ${score.score}/100 — ${score.classificacao}. ` +
      (kanitz ? `Kanitz FI=${kanitz.fatorInsolvencia} (${kanitz.classificacao}). ` : "") +
      (alertas.length ? `${alertas.length} alerta(s).` : "Sem alertas relevantes.")
    : `Consolidação parcial para ${input.classe} de ${empresa} (${periodo}).`;

  return {
    titulo: `Consolidação ${input.classe} — ${empresa} ${periodo}`,
    sumario,
    blocos,
  };
}

// ───────────── main ─────────────
export function consolidate(input: ConsolidationInput): ConsolidationResult {
  const { metrics, usedFields } = extractMetrics(input);
  const isFinancialDoc = ["BALANCETE", "BALANCO", "DRE", "DFC", "RAZAO"].includes(
    String(input.classe || "").toUpperCase(),
  );

  // Indicators only meaningful with balanço-like data
  const hasBalanco = metrics.ativo_circulante + metrics.passivo_circulante + metrics.pl > 0;
  const hasResultado = metrics.receita_liquida > 0 || metrics.lucro_liquido !== 0;

  const ind = hasBalanco || hasResultado ? buildIndicadores(metrics) : null;
  const kanitz = hasBalanco ? buildKanitz(metrics) : null;
  const score = ind && kanitz ? buildScoreRJ(ind, kanitz) : null;
  const alertas = buildAlertas(metrics, ind);

  const relatorio = buildRelatorio(
    input, ind, kanitz, score, alertas, metrics,
  );

  return {
    classe: input.classe,
    computed_at: new Date().toISOString(),
    empresa: input.context?.empresa,
    periodo: { ano: input.context?.ano, mes: input.context?.mes },
    indicadores: isFinancialDoc ? ind : ind, // keep null when nothing extractable
    kanitz,
    score_rj: score,
    alertas,
    relatorio,
    raw_metrics: metrics,
    source_fields: usedFields,
  };
}
