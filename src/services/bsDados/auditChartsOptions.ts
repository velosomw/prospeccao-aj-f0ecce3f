// ============================================================
// auditChartsOptions.ts — 6 gráficos pixel-perfect Excel BEX
// ============================================================
import type { MonthlyDatum } from "./types";
import { computeBSIndicators } from "./bsDadosBuilder";

export const EXCEL_COLORS = {
  azul: "#4F81BD",
  laranja: "#F79646",
  vermelho: "#C00000",
  verde: "#9BBB59",
  roxo: "#8064A2",
  cinza: "#D9D9D9",
  cinzaEscuro: "#7F7F7F",
  ciano: "#4BACC6",
  amarelo: "#F2C200",
};

const TEXT_STYLE = {
  fontFamily: "Segoe UI, Arial, sans-serif",
  fontSize: 11,
  color: "#333",
};

// ─── Foprospecçãotadores BR ─────────────────────────────────────────
export const fmtMilhar = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("pt-BR");
  return n < 0 ? `(${s})` : s;
};
export const fmtPct = (v: number | null | undefined, dec = 2) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(dec).replace(".", ",")}%`;
};
export const fmtDec = (v: number | null | undefined, dec = 2) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(dec).replace(".", ",");
};

const labelBox = (foprospecçãotter: any, position: any = "top") => ({
  show: true,
  position,
  foprospecçãotter,
  fontSize: 10,
  fontFamily: TEXT_STYLE.fontFamily,
  color: "#333",
  backgroundColor: "#fff",
  borderColor: "#BFBFBF",
  borderWidth: 0.5,
  borderRadius: 2,
  padding: [2, 4],
});

const baseAxis = {
  axisLine: { lineStyle: { color: "#7F7F7F" } },
  axisLabel: { ...TEXT_STYLE, fontSize: 10 },
  splitLine: { lineStyle: { color: "#E7E7E7", type: "dashed" } },
};

const baseGrid = { left: 60, right: 60, top: 60, bottom: 50, containLabel: true };

const baseTooltip = {
  trigger: "axis" as const,
  backgroundColor: "rgba(255,255,255,0.95)",
  borderColor: "#BFBFBF",
  textStyle: TEXT_STYLE,
};

// ============================================================
// 1) CMV / Receita Líquida — barras + linha %
// ============================================================
export function buildCMVOption(data: MonthlyDatum[]) {
  const meses = data.map(d => d.mes);
  const receita = data.map(d => d.receita_liquida / 1000);
  const cmv = data.map(d => Math.abs(d.cmv) / 1000);
  const pct = data.map(d => computeBSIndicators(d as any).cmvPct ?? 0);

  return {
    title: { text: "CMV / Receita Líquida", left: "center", textStyle: { ...TEXT_STYLE, fontSize: 13, fontWeight: "bold" } },
    tooltip: baseTooltip,
    legend: { bottom: 0, textStyle: TEXT_STYLE },
    grid: baseGrid,
    xAxis: { type: "category" as const, data: meses, ...baseAxis },
    yAxis: [
      { type: "value" as const, name: "R$ x 1.000", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtMilhar(v) } },
      { type: "value" as const, name: "%", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtPct(v, 0) } },
    ],
    series: [
      { name: "Receita Líquida", type: "bar", data: receita, itemStyle: { color: EXCEL_COLORS.azul }, label: labelBox((p: any) => fmtMilhar(p.value)) },
      { name: "CMV", type: "bar", data: cmv, itemStyle: { color: EXCEL_COLORS.laranja }, label: labelBox((p: any) => fmtMilhar(p.value)) },
      {
        name: "% CMV/RL", type: "line", yAxisIndex: 1, data: pct,
        lineStyle: { color: EXCEL_COLORS.vermelho, width: 2 },
        itemStyle: { color: EXCEL_COLORS.vermelho },
        symbol: "circle", symbolSize: 6,
        label: labelBox((p: any) => fmtPct(p.value)),
      },
    ],
  };
}

// ============================================================
// 2) (CMV + Despesa) / Receita — barras + linha % + ref 100%
// ============================================================
export function buildCMVDespesaOption(data: MonthlyDatum[]) {
  const meses = data.map(d => d.mes);
  const receita = data.map(d => d.receita_liquida / 1000);
  const cmv = data.map(d => Math.abs(d.cmv) / 1000);
  const desp = data.map(d => Math.abs(d.despesas) / 1000);
  const pct = data.map(d => computeBSIndicators(d as any).cmvDespPct ?? 0);

  return {
    title: { text: "(CMV + Despesa) × Receita", left: "center", textStyle: { ...TEXT_STYLE, fontSize: 13, fontWeight: "bold" } },
    tooltip: baseTooltip,
    legend: { bottom: 0, textStyle: TEXT_STYLE },
    grid: baseGrid,
    xAxis: { type: "category" as const, data: meses, ...baseAxis },
    yAxis: [
      { type: "value" as const, name: "R$ x 1.000", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtMilhar(v) } },
      { type: "value" as const, name: "%", max: 1.5, ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtPct(v, 0) } },
    ],
    series: [
      { name: "Receita Líquida", type: "bar", stack: "rec", data: receita, itemStyle: { color: EXCEL_COLORS.azul } },
      { name: "CMV", type: "bar", stack: "custos", data: cmv, itemStyle: { color: EXCEL_COLORS.laranja } },
      { name: "Despesas", type: "bar", stack: "custos", data: desp, itemStyle: { color: EXCEL_COLORS.cinzaEscuro } },
      {
        name: "% (CMV+Desp)/RL", type: "line", yAxisIndex: 1, data: pct,
        lineStyle: { color: EXCEL_COLORS.vermelho, width: 2 },
        itemStyle: { color: EXCEL_COLORS.vermelho },
        markLine: {
          silent: true,
          symbol: "none",
          data: [{ yAxis: 1, lineStyle: { type: "dashed", color: EXCEL_COLORS.cinzaEscuro }, label: { show: true, foprospecçãotter: "100%" } }],
        },
        label: labelBox((p: any) => fmtPct(p.value)),
      },
    ],
  };
}

// ============================================================
// 3) Resultado / Receita — margem
// ============================================================
export function buildResultadoOption(data: MonthlyDatum[]) {
  const meses = data.map(d => d.mes);
  const receita = data.map(d => d.receita_liquida / 1000);
  const resultado = data.map(d => d.resultado / 1000);
  const margem = data.map(d => computeBSIndicators(d as any).margemResultado ?? 0);

  return {
    title: { text: "Resultado / Receita Líquida", left: "center", textStyle: { ...TEXT_STYLE, fontSize: 13, fontWeight: "bold" } },
    tooltip: baseTooltip,
    legend: { bottom: 0, textStyle: TEXT_STYLE },
    grid: baseGrid,
    xAxis: { type: "category" as const, data: meses, ...baseAxis },
    yAxis: [
      { type: "value" as const, name: "R$ x 1.000", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtMilhar(v) } },
      { type: "value" as const, name: "Margem %", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtPct(v, 0) } },
    ],
    series: [
      { name: "Receita Líquida", type: "bar", data: receita, itemStyle: { color: EXCEL_COLORS.azul } },
      {
        name: "Resultado", type: "bar", data: resultado,
        itemStyle: {
          color: (p: any) => (p.value >= 0 ? EXCEL_COLORS.verde : EXCEL_COLORS.vermelho),
        },
        label: labelBox((p: any) => fmtMilhar(p.value)),
      },
      {
        name: "Margem %", type: "line", yAxisIndex: 1, data: margem,
        lineStyle: { color: EXCEL_COLORS.roxo, width: 2 },
        itemStyle: { color: EXCEL_COLORS.roxo },
        label: labelBox((p: any) => fmtPct(p.value)),
      },
    ],
  };
}

// ============================================================
// 4) EBITDA — linha + ref zero
// ============================================================
export function buildEBITDAOption(data: MonthlyDatum[]) {
  const meses = data.map(d => d.mes);
  const ebitda = data.map(d => d.ebitda / 1000);

  return {
    title: { text: "EBITDA", left: "center", textStyle: { ...TEXT_STYLE, fontSize: 13, fontWeight: "bold" } },
    tooltip: baseTooltip,
    legend: { bottom: 0, textStyle: TEXT_STYLE },
    grid: baseGrid,
    xAxis: { type: "category" as const, data: meses, ...baseAxis },
    yAxis: { type: "value" as const, name: "R$ x 1.000", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtMilhar(v) } },
    series: [
      {
        name: "EBITDA", type: "line", data: ebitda,
        lineStyle: { color: EXCEL_COLORS.ciano, width: 3 },
        itemStyle: { color: EXCEL_COLORS.ciano },
        symbol: "circle", symbolSize: 8,
        areaStyle: { color: EXCEL_COLORS.ciano, opacity: 0.18 },
        label: labelBox((p: any) => fmtMilhar(p.value)),
        markLine: {
          silent: true,
          symbol: "none",
          data: [{ yAxis: 0, lineStyle: { type: "dashed", color: EXCEL_COLORS.cinzaEscuro } }],
        },
      },
    ],
  };
}

// ============================================================
// 5) Liquidez — 4 linhas
// ============================================================
export function buildLiquidezOption(data: MonthlyDatum[]) {
  const meses = data.map(d => d.mes);
  const ind = data.map(d => computeBSIndicators(d as any));
  const lc = ind.map(i => i.liquidez_corrente);
  const ls = ind.map(i => i.liquidez_seca);
  const li = ind.map(i => i.liquidez_imediata);
  const lg = ind.map(i => i.liquidez_geral);

  return {
    title: { text: "Índices de Liquidez", left: "center", textStyle: { ...TEXT_STYLE, fontSize: 13, fontWeight: "bold" } },
    tooltip: { ...baseTooltip, valueFoprospecçãotter: (v: number) => fmtDec(v) },
    legend: { bottom: 0, textStyle: TEXT_STYLE },
    grid: baseGrid,
    xAxis: { type: "category" as const, data: meses, ...baseAxis },
    yAxis: { type: "value" as const, ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtDec(v) } },
    series: [
      { name: "Liquidez Corrente (LC)", type: "line", data: lc, lineStyle: { color: EXCEL_COLORS.azul, width: 2 }, itemStyle: { color: EXCEL_COLORS.azul }, symbol: "circle", label: labelBox((p: any) => fmtDec(p.value)) },
      { name: "Liquidez Seca (LS)", type: "line", data: ls, lineStyle: { color: EXCEL_COLORS.laranja, width: 2 }, itemStyle: { color: EXCEL_COLORS.laranja }, symbol: "rect" },
      { name: "Liquidez Imediata (LI)", type: "line", data: li, lineStyle: { color: EXCEL_COLORS.verde, width: 2 }, itemStyle: { color: EXCEL_COLORS.verde }, symbol: "triangle" },
      { name: "Liquidez Geral (LG)", type: "line", data: lg, lineStyle: { color: EXCEL_COLORS.roxo, width: 2 }, itemStyle: { color: EXCEL_COLORS.roxo }, symbol: "diamond" },
    ],
  };
}

// ============================================================
// 6) Endividamento — stack bar + linha total
// ============================================================
export function buildEndividamentoOption(data: MonthlyDatum[]) {
  const meses = data.map(d => d.mes);
  const trib = data.map(d => d.divida_tributaria / 1000);
  const trab = data.map(d => d.divida_trabalhista / 1000);
  const fin = data.map(d => d.divida_financeira / 1000);
  const forn = data.map(d => d.fornecedores / 1000);
  const rj = data.map(d => d.credores_rj / 1000);
  const total = data.map(d => d.divida_total / 1000);

  return {
    title: { text: "Endividamento (componentes)", left: "center", textStyle: { ...TEXT_STYLE, fontSize: 13, fontWeight: "bold" } },
    tooltip: baseTooltip,
    legend: { bottom: 0, textStyle: TEXT_STYLE },
    grid: baseGrid,
    xAxis: { type: "category" as const, data: meses, ...baseAxis },
    yAxis: [
      { type: "value" as const, name: "R$ x 1.000", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtMilhar(v) } },
      { type: "value" as const, name: "Total", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, foprospecçãotter: (v: number) => fmtMilhar(v) } },
    ],
    series: [
      { name: "Tributária", type: "bar", stack: "div", data: trib, itemStyle: { color: EXCEL_COLORS.vermelho } },
      { name: "Trabalhista", type: "bar", stack: "div", data: trab, itemStyle: { color: EXCEL_COLORS.laranja } },
      { name: "Financeira", type: "bar", stack: "div", data: fin, itemStyle: { color: EXCEL_COLORS.azul } },
      { name: "Fornecedores", type: "bar", stack: "div", data: forn, itemStyle: { color: EXCEL_COLORS.cinzaEscuro } },
      { name: "Credores RJ", type: "bar", stack: "div", data: rj, itemStyle: { color: EXCEL_COLORS.amarelo } },
      {
        name: "Dívida Total", type: "line", yAxisIndex: 1, data: total,
        lineStyle: { color: EXCEL_COLORS.roxo, width: 3 },
        itemStyle: { color: EXCEL_COLORS.roxo },
        symbol: "circle", symbolSize: 7,
        label: labelBox((p: any) => fmtMilhar(p.value)),
      },
    ],
  };
}

// ============================================================
// Insights automáticos
// ============================================================
export interface Insight {
  tipo: "ok" | "atencao" | "critico";
  texto: string;
}

export function generateInsights(data: MonthlyDatum[]): Insight[] {
  if (!data.length) return [];
  const out: Insight[] = [];

  const ind = data.map(d => computeBSIndicators(d as any));
  const margNeg = ind.filter(i => (i.margemResultado ?? 0) < 0).length;
  if (margNeg > 0) {
    out.push({
      tipo: margNeg >= 3 ? "critico" : "atencao",
      texto: `Margem líquida negativa em ${margNeg} ${margNeg === 1 ? "mês" : "meses"}`,
    });
  }

  const cmvAlto = data
    .map((d, i) => ({ d, p: ind[i].cmvPct ?? 0 }))
    .filter(x => x.p > 0.8);
  if (cmvAlto.length) {
    out.push({
      tipo: "atencao",
      texto: `CMV >80% da receita em ${cmvAlto.map(x => x.d.mes).join(", ")}`,
    });
  }

  const lcBaixa = ind.filter(i => (i.liquidez_corrente ?? Infinity) < 1).length;
  if (lcBaixa > 0) {
    out.push({
      tipo: "critico",
      texto: `Liquidez corrente <1 em ${lcBaixa} ${lcBaixa === 1 ? "mês" : "meses"} — risco de curto prazo`,
    });
  }

  const dividaCresc = data.length >= 2 &&
    data[data.length - 1].divida_total > data[0].divida_total * 1.1;
  if (dividaCresc) {
    out.push({
      tipo: "atencao",
      texto: `Dívida total cresceu mais de 10% no período`,
    });
  }

  if (!out.length) {
    out.push({ tipo: "ok", texto: "Indicadores dentro do esperado para o período analisado" });
  }
  return out;
}
