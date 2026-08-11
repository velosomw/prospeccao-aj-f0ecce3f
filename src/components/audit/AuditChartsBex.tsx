/**
 * 12 Gráficos BEX (Aba "GRÁFICOS 2") — Recharts.
 * Conforme ABA_GRAFICOS_AUDITORIA_REPLICACAO.md §8.
 */
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, BarChart, LineChart,
  Bar, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import {
  EXCEL_COLORS, TITLE_STYLE, SUB_STYLE, AXIS_PROPS, GRID, TOOLTIP_STYLE, LEGEND_STYLE,
  fmtMilhar, fmtDec, fmtPct,
} from "./chartsCommons";
import { computeIndicators, type MonthlyDatum } from "@/services/auditDatasetBuilder";

interface Props { data: MonthlyDatum[] }

interface SeriesRow {
  mes: string;
  liqGeral: number | null;
  liqCorrente: number | null;
  pcK: number; pncK: number;
  emprK: number;
  imobIntK: number;
  imobIntSobrePLPnc: number | null;
  endivGeral: number | null;
  custoSobreReceita: number | null;
  resultadoSobreReceita: number | null;
  receitaK: number;
  custoDespK: number;
  receitaMedK: number;
  custoDespMedK: number;
  resultadoK: number;
}

function buildSeries(data: MonthlyDatum[]): SeriesRow[] {
  const n = data.length || 1;
  return data.map(d => {
    const ind = computeIndicators(d);
    const ac = d.ativo_circulante, anc = d.ativo_nao_circulante;
    const pc = d.passivo_circulante, pnc = d.passivo_nao_circulante;
    const at = ac + anc, pt = pc + pnc;
    const pl = d.patrimonio_liquido ?? 0;
    const imob = d.imobilizado ?? 0;
    const intg = d.intangivel ?? 0;
    const imobInt = imob + intg > 0 ? imob + intg : anc;
    const receita = Math.abs(d.receita_liquida);
    const custoDesp = Math.abs(d.cmv) + Math.abs(d.despesas);
    return {
      mes: d.mes,
      liqGeral: ind.liquidez_geral,
      liqCorrente: ind.liquidez_corrente,
      pcK: Math.round(pc / 1000),
      pncK: Math.round(pnc / 1000),
      emprK: Math.round(d.divida_financeira / 1000),
      imobIntK: Math.round(imobInt / 1000),
      imobIntSobrePLPnc: pl + pnc > 0 ? imobInt / (pl + pnc) : null,
      endivGeral: at > 0 ? pt / at : null,
      custoSobreReceita: receita > 0 ? custoDesp / receita : null,
      resultadoSobreReceita: receita > 0 ? d.resultado / receita : null,
      receitaK: Math.round(receita / 1000),
      custoDespK: Math.round(custoDesp / 1000),
      receitaMedK: Math.round((receita / n) / 1000),
      custoDespMedK: Math.round((custoDesp / n) / 1000),
      resultadoK: Math.round(d.resultado / 1000),
    };
  });
}

const Tile: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <Card className="border-2 border-[hsl(var(--border))]">
    <CardContent className="p-3">
      <p className={TITLE_STYLE}>{title}</p>
      {subtitle && <p className={SUB_STYLE}>{subtitle}</p>}
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as any}
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

const AuditChartsBex = ({ data }: Props) => {
  const series = useMemo(() => buildSeries(data), [data]);

  if (!series.length) return null;

  const tipDec = (v: any) => fmtDec(Number(v));
  const tipPct = (v: any) => fmtPct(Number(v));
  const tipMilhar = (v: any) => fmtMilhar(Number(v));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* 1 — Liquidez Geral */}
      <Tile title="LIQUIDEZ GERAL">
        <LineChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={(v) => fmtDec(v, 1)} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipDec} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.cinzaEscuro} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="liqGeral" name="Liquidez Geral" stroke={EXCEL_COLORS.azul} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 2 — Liquidez Corrente e Geral */}
      <Tile title="LIQUIDEZ CORRENTE E GERAL">
        <LineChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={(v) => fmtDec(v, 1)} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipDec} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.cinzaEscuro} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="liqGeral" name="Liquidez Geral" stroke={EXCEL_COLORS.azul} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
          <Line type="monotone" dataKey="liqCorrente" name="Liquidez Corrente" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 3 — Evolução do Passivo (R$ x1000) */}
      <Tile title="EVOLUÇÃO DO PASSIVO" subtitle="R$ x 1.000">
        <BarChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipMilhar} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Bar dataKey="pcK" name="Passivo Circulante" stackId="p" fill={EXCEL_COLORS.azul} />
          <Bar dataKey="pncK" name="Passivo Não-Circulante" stackId="p" fill={EXCEL_COLORS.laranja} />
        </BarChart>
      </Tile>

      {/* 4 — Empréstimos e Financiamentos */}
      <Tile title="EMPRÉSTIMOS E FINANCIAMENTOS" subtitle="R$ x 1.000">
        <LineChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipMilhar} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Line type="monotone" dataKey="emprK" name="Empréstimos/Financ." stroke={EXCEL_COLORS.cinzaEscuro} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 5 — (Imob + Intang) / (PL + PNC) */}
      <Tile title="IMOB + INTANG / (PL + PNC)">
        <BarChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipPct} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100%", fill: EXCEL_COLORS.vermelho, fontSize: 10 }} />
          <Bar dataKey="imobIntSobrePLPnc" name="Imob+Intang / (PL+PNC)" fill={EXCEL_COLORS.roxo} />
        </BarChart>
      </Tile>

      {/* 6 — Imobilizado + Intangível (absoluto) */}
      <Tile title="IMOBILIZADO + INTANGÍVEL" subtitle="R$ x 1.000">
        <BarChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipMilhar} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Bar dataKey="imobIntK" name="Imobilizado + Intangível" fill={EXCEL_COLORS.ciano} />
        </BarChart>
      </Tile>

      {/* 7 — Endividamento Geral */}
      <Tile title="ENDIVIDAMENTO GERAL">
        <LineChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipPct} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.cinzaEscuro} strokeDasharray="4 4" label={{ value: "100%", fontSize: 10 }} />
          <Line type="monotone" dataKey="endivGeral" name="Endiv. Geral" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 8 — Resultado / Receita Líquida */}
      <Tile title="RESULTADO / RECEITA LÍQUIDA">
        <LineChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipPct} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <ReferenceLine y={0} stroke={EXCEL_COLORS.cinzaEscuro} />
          <Line type="monotone" dataKey="resultadoSobreReceita" name="Margem Resultado" stroke={EXCEL_COLORS.verde} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </LineChart>
      </Tile>

      {/* 9 — (Custo + Despesa) / Receita % */}
      <Tile title="(CUSTO + DESPESA) / RECEITA %">
        <BarChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipPct} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <ReferenceLine y={1} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100%", fill: EXCEL_COLORS.vermelho, fontSize: 10 }} />
          <Bar dataKey="custoSobreReceita" name="(Custo+Desp)/Receita" fill={EXCEL_COLORS.laranja} />
        </BarChart>
      </Tile>

      {/* 10 — Custo/Desp × Receita (acumulado) */}
      <Tile title="CUSTO/DESP × RECEITA — ACUMULADO" subtitle="R$ x 1.000">
        <BarChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipMilhar} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Bar dataKey="receitaK" name="Receita" fill={EXCEL_COLORS.azul} />
          <Bar dataKey="custoDespK" name="Custo + Despesa" fill={EXCEL_COLORS.vermelho} />
        </BarChart>
      </Tile>

      {/* 11 — Custo/Desp × Receita (média mensal) */}
      <Tile title="CUSTO/DESP × RECEITA — MÉDIA MENSAL" subtitle="R$ x 1.000">
        <BarChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
          <Tooltip {...TOOLTIP_STYLE} formatter={tipMilhar} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Bar dataKey="receitaMedK" name="Receita média" fill={EXCEL_COLORS.azul} />
          <Bar dataKey="custoDespMedK" name="Custo+Desp média" fill={EXCEL_COLORS.vermelho} />
        </BarChart>
      </Tile>

      {/* 12 — Resultado × Receita (dual axis) */}
      <Tile title="RESULTADO × RECEITA" subtitle="R$ x 1.000 e %">
        <ComposedChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
          {GRID}
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis yAxisId="L" {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
          <YAxis yAxisId="R" orientation="right" {...AXIS_PROPS} tickFoprospecçãotter={(v) => `${Math.round(v * 100)}%`} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Bar yAxisId="L" dataKey="receitaK" name="Receita" fill={EXCEL_COLORS.azul} />
          <Bar yAxisId="L" dataKey="resultadoK" name="Resultado" fill={EXCEL_COLORS.verde} />
          <Line yAxisId="R" type="monotone" dataKey="resultadoSobreReceita" name="Margem" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
        </ComposedChart>
      </Tile>
    </div>
  );
};

export default AuditChartsBex;
