// Registros de Prospecção — agregação por período (mensal/bimestral/trimestral/semestral/anual/custom)
// Consome BSDadosRow[] (já produzido por buildBSDados) e devolve um ReportDataset
// pronto para os renderers DOCX/PDF.
import type { BSDadosRow } from "@/services/bsDadosBuilder";
import { computeBSIndicators } from "@/services/bsDadosBuilder";

export type Agregacao = "monthly" | "bimonthly" | "quarterly" | "semester" | "annual" | "custom";

export interface ReportBlocks {
  balanco: boolean;
  endividamento: boolean;
  dre: boolean;
  kanitz: boolean;
  scoreRJ: boolean;
}

export interface ReportPeriodBlock {
  label: string;            // ex.: "Setembro/2025", "1º Trimestre 2025", "Jan→Mar 2025"
  fromKey: string;          // "YYYY-MM"
  toKey: string;            // "YYYY-MM"
  snapshot: BSDadosRow;     // balanço/PL → último mês do bucket
  dre: {
    receita_liquida: number;
    cmv: number;
    despesas: number;
    resultado: number;
  };
  indicators: {
    liquidez_corrente: number;
    liquidez_seca: number;
    liquidez_imediata: number;
    liquidez_geral: number;
    endividamento_total: number;       // PT / AT
    endividamento_cp: number;          // PC / AT
    endividamento_lp: number;          // PNC / AT
    composicao_endividamento: number;  // PC / PT
    capital_terceiros: number;         // PT / (PT+PL)
    imobilizacao_pl: number;           // (AT-AC) / PL
  };
  kanitz: { fi: number; classificacao: "solvente" | "penumbra" | "insolvente" } | null;
  scoreRJ: { score: number; classificacao: string } | null;
}

export interface ReportDataset {
  empresaNome: string;
  empresaCnpj?: string | null;
  prospeccaoId?: string | null;
  agregacao: Agregacao;
  emittedAt: Date;
  periodos: ReportPeriodBlock[];
  blocks: ReportBlocks;
}

const MES_NOMES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function parseKey(k: string): { ano: number; mes: number } {
  const [a, m] = k.split("-").map(Number);
  return { ano: a, mes: m };
}
function fmtMesAno(k: string): string {
  const { ano, mes } = parseKey(k);
  return `${MES_NOMES[mes]}/${ano}`;
}
function safeDiv(a: number, b: number): number {
  return !b ? 0 : a / b;
}

function bucketSize(a: Agregacao): number {
  switch (a) {
    case "monthly": return 1;
    case "bimonthly": return 2;
    case "quarterly": return 3;
    case "semester": return 6;
    case "annual": return 12;
    case "custom": return Infinity;
  }
}

function labelForBucket(rows: BSDadosRow[], a: Agregacao): string {
  if (rows.length === 1) return fmtMesAno(rows[0].mesKey);
  const ini = fmtMesAno(rows[0].mesKey);
  const fim = fmtMesAno(rows[rows.length - 1].mesKey);
  if (a === "quarterly") {
    const { mes, ano } = parseKey(rows[0].mesKey);
    const q = Math.floor((mes - 1) / 3) + 1;
    return `${q}º Trimestre ${ano} (${ini} → ${fim})`;
  }
  if (a === "semester") {
    const { mes, ano } = parseKey(rows[0].mesKey);
    return `${mes <= 6 ? "1º" : "2º"} Semestre ${ano}`;
  }
  if (a === "annual") return `${parseKey(rows[0].mesKey).ano}`;
  return `${ini} → ${fim}`;
}

function kanitzFor(r: BSDadosRow): ReportPeriodBlock["kanitz"] {
  // FI Kanitz precisa de Lucro Líquido / PL → aqui o resultado é proxy do LL.
  const X1 = safeDiv(r.resultado, r.patrimonio_liquido);
  const X2 = safeDiv(r.ativo_circulante + r.ativo_nao_circulante, r.passivo_circulante + r.passivo_nao_circulante);
  const X3 = safeDiv(r.ativo_circulante - r.estoques, r.passivo_circulante);
  const X4 = safeDiv(r.ativo_circulante, r.passivo_circulante);
  const X5 = -safeDiv(r.passivo_circulante + r.passivo_nao_circulante, r.patrimonio_liquido);
  const fi = 0.05 * X1 + 1.65 * X2 + 3.55 * X3 - 1.06 * X4 - 0.33 * X5;
  if (!Number.isFinite(fi)) return null;
  const cls: "solvente" | "penumbra" | "insolvente" =
    fi >= 0 ? "solvente" : fi <= -3 ? "insolvente" : "penumbra";
  return { fi: Math.round(fi * 1000) / 1000, classificacao: cls };
}

function scoreRJFor(r: BSDadosRow, ind: ReportPeriodBlock["indicators"]): ReportPeriodBlock["scoreRJ"] {
  const liqPenalty = Math.max(0, 1 - ind.liquidez_corrente) * 25;
  const endivPenalty = Math.max(0, ind.endividamento_total - 0.6) * 60;
  const margem = safeDiv(r.resultado, r.receita_liquida);
  const margemPenalty = Math.max(0, -margem) * 40;
  const k = kanitzFor(r);
  const kanitzPenalty = !k ? 0 : k.fi >= 0 ? 0 : Math.min(40, Math.abs(k.fi) * 10);
  const raw = liqPenalty + endivPenalty + margemPenalty + kanitzPenalty;
  const score = Math.min(100, Math.round(raw));
  const cls =
    score < 30 ? "Saudável" :
    score < 55 ? "Atenção" :
    score < 80 ? "Alto Risco" : "Forte Indicativo de RJ";
  return { score, classificacao: cls };
}

function computeBlock(bucketRows: BSDadosRow[], a: Agregacao): ReportPeriodBlock {
  const snapshot = bucketRows[bucketRows.length - 1];
  const dre = bucketRows.reduce(
    (acc, r) => ({
      receita_liquida: acc.receita_liquida + (r.receita_liquida || 0),
      cmv: acc.cmv + (r.cmv || 0),
      despesas: acc.despesas + (r.despesas || 0),
      resultado: acc.resultado + (r.resultado || 0),
    }),
    { receita_liquida: 0, cmv: 0, despesas: 0, resultado: 0 },
  );

  const base = computeBSIndicators(snapshot);
  const AT = snapshot.ativo_circulante + snapshot.ativo_nao_circulante;
  const PT = snapshot.passivo_circulante + snapshot.passivo_nao_circulante;
  const PL = snapshot.patrimonio_liquido;
  const indicators = {
    liquidez_corrente: base.liquidez_corrente,
    liquidez_seca: base.liquidez_seca,
    liquidez_imediata: base.liquidez_imediata,
    liquidez_geral: base.liquidez_geral,
    endividamento_total: safeDiv(PT, AT),
    endividamento_cp: safeDiv(snapshot.passivo_circulante, AT),
    endividamento_lp: safeDiv(snapshot.passivo_nao_circulante, AT),
    composicao_endividamento: safeDiv(snapshot.passivo_circulante, PT),
    capital_terceiros: safeDiv(PT, PT + PL),
    imobilizacao_pl: safeDiv(AT - snapshot.ativo_circulante, PL),
  };

  const k = kanitzFor(snapshot);
  const s = scoreRJFor({ ...snapshot, receita_liquida: dre.receita_liquida, resultado: dre.resultado }, indicators);

  return {
    label: labelForBucket(bucketRows, a),
    fromKey: bucketRows[0].mesKey,
    toKey: snapshot.mesKey,
    snapshot,
    dre,
    indicators,
    kanitz: k,
    scoreRJ: s,
  };
}

export interface BuildOpts {
  empresaNome: string;
  empresaCnpj?: string | null;
  prospeccaoId?: string | null;
  rows: BSDadosRow[];     // ordenadas cronológica
  fromKey?: string | null;
  toKey?: string | null;
  agregacao: Agregacao;
  blocks?: Partial<ReportBlocks>;
}

const DEFAULT_BLOCKS: ReportBlocks = {
  balanco: true,
  endividamento: true,
  dre: true,
  kanitz: false,
  scoreRJ: true,
};

export function buildReportDataset(opts: BuildOpts): ReportDataset {
  const sorted = [...opts.rows].sort((a, b) => a.mesKey.localeCompare(b.mesKey));
  const filtered = sorted.filter(r => {
    if (opts.fromKey && r.mesKey < opts.fromKey) return false;
    if (opts.toKey && r.mesKey > opts.toKey) return false;
    return true;
  });

  const periodos: ReportPeriodBlock[] = [];
  if (filtered.length === 0) {
    return {
      empresaNome: opts.empresaNome,
      empresaCnpj: opts.empresaCnpj ?? null,
      prospeccaoId: opts.prospeccaoId ?? null,
      agregacao: opts.agregacao,
      emittedAt: new Date(),
      periodos,
      blocks: { ...DEFAULT_BLOCKS, ...(opts.blocks || {}) },
    };
  }

  if (opts.agregacao === "custom") {
    periodos.push(computeBlock(filtered, "custom"));
  } else if (opts.agregacao === "monthly") {
    for (const r of filtered) periodos.push(computeBlock([r], "monthly"));
  } else {
    const size = bucketSize(opts.agregacao);
    // Bucket por ano + slot (chunks consecutivos do mesmo tamanho dentro do ano)
    const byYear = new Map<number, BSDadosRow[]>();
    for (const r of filtered) {
      const y = parseKey(r.mesKey).ano;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(r);
    }
    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    for (const y of years) {
      const ys = byYear.get(y)!;
      // group by Math.floor((mes-1)/size)
      const slots = new Map<number, BSDadosRow[]>();
      for (const r of ys) {
        const slot = Math.floor((parseKey(r.mesKey).mes - 1) / size);
        if (!slots.has(slot)) slots.set(slot, []);
        slots.get(slot)!.push(r);
      }
      const slotKeys = Array.from(slots.keys()).sort((a, b) => a - b);
      for (const sk of slotKeys) periodos.push(computeBlock(slots.get(sk)!, opts.agregacao));
    }
  }

  return {
    empresaNome: opts.empresaNome,
    empresaCnpj: opts.empresaCnpj ?? null,
    prospeccaoId: opts.prospeccaoId ?? null,
    agregacao: opts.agregacao,
    emittedAt: new Date(),
    periodos,
    blocks: { ...DEFAULT_BLOCKS, ...(opts.blocks || {}) },
  };
}

// Foprospeccaotadores reutilizáveis pelos renderers
export const fmtBRL = (v: number): string =>
  (v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPct = (v: number, dec = 2): string =>
  `${((v ?? 0) * 100).toFixed(dec)}%`;
export const fmtRatio = (v: number, dec = 3): string => (v ?? 0).toFixed(dec);
export const fmtDate = (d: Date): string =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
