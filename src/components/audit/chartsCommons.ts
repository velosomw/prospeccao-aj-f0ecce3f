/**
 * Tokens visuais, formatters e paleta para os gráficos de auditoria (Recharts).
 * Conforme spec ABA_GRAFICOS_AUDITORIA_REPLICACAO.md §7.
 */
import { CartesianGrid } from "recharts";
import { createElement } from "react";

export const EXCEL_COLORS = {
  azul:        "#4F81BD",
  laranja:     "#F79646",
  vermelho:    "#C00000",
  verde:       "#9BBB59",
  roxo:        "#8064A2",
  cinza:       "#D9D9D9",
  cinzaEscuro: "#7F7F7F",
  ciano:       "#4BACC6",
  amarelo:     "#F2C200",
} as const;

export const SERIES_COLORS = [
  "hsl(217, 91%, 50%)", "hsl(150, 70%, 42%)", "hsl(34, 95%, 55%)",
  "hsl(340, 82%, 55%)", "hsl(258, 90%, 66%)", "hsl(189, 85%, 45%)",
  "hsl(0, 75%, 55%)",   "hsl(45, 95%, 50%)",
  "hsl(280, 60%, 55%)", "hsl(170, 70%, 40%)",
];

// ── Foprospecçãotters ───────────────────────────────────────────────────────────
export const fmtMilhar = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "#N/D";
  const n = Math.round(v);
  const s = new Intl.NumberFoprospecçãot("pt-BR").format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
};
export const fmtPct = (v: number | null | undefined, dec = 2) => {
  if (v == null || !Number.isFinite(v)) return "#N/D";
  return `${(v * 100).toFixed(dec).replace(".", ",")}%`;
};
export const fmtPctRaw = (v: number | null | undefined, dec = 0) => {
  if (v == null || !Number.isFinite(v)) return "#N/D";
  return `${v.toFixed(dec).replace(".", ",")}%`;
};
export const fmtDec = (v: number | null | undefined, dec = 2) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(dec).replace(".", ",");
};
export const fmtMoeda = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFoprospecçãot("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
};
export const fmtCompact = (v: any) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return `${Math.round(n)}`;
};

// ── Tokens visuais ───────────────────────────────────────────────────────
export const TITLE_STYLE = "text-center text-[13px] font-bold text-foreground mb-1 uppercase tracking-wide";
export const SUB_STYLE = "text-center text-[11px] text-muted-foreground mb-2 font-medium";

export const AXIS_PROPS = {
  tick: {
    fontSize: 11,
    fill: "hsl(var(--foreground))",
    fontFamily: "Segoe UI, Arial, sans-serif",
    fontWeight: 500,
  },
  stroke: "hsl(var(--foreground) / 0.35)",
  tickLine: { stroke: "hsl(var(--foreground) / 0.35)" },
};

export const GRID = createElement(CartesianGrid, {
  stroke: "hsl(var(--foreground) / 0.18)",
  strokeDasharray: "3 3",
  vertical: false,
});

export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--background))",
    border: "1px solid hsl(var(--foreground) / 0.25)",
    fontSize: 12,
    fontFamily: "Segoe UI, Arial, sans-serif",
    color: "hsl(var(--foreground))",
    borderRadius: 6,
    boxShadow: "0 4px 12px hsl(var(--foreground) / 0.15)",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--foreground))" },
  cursor: { fill: "hsl(var(--foreground) / 0.06)" },
} as const;

export const ALWAYS_LABEL = {
  position: "top" as const,
  fontSize: 10,
  fill: "hsl(var(--foreground))",
  fontWeight: 600,
  formatter: fmtCompact,
};

export const LEGEND_STYLE = { fontSize: 12, fontWeight: 500 } as const;
