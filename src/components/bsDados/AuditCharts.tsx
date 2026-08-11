/**
 * 6 Indicadores Operacionais — Recharts.
 * Conforme ABA_GRAFICOS_AUDITORIA_REPLICACAO.md §9.
 */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, Bar, Line,
  XAxis, YAxis, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Database } from "lucide-react";
import { buildBSDados, bsDadosToMonthlyDataset } from "@/services/bsDados/bsDadosBuilder";
import type { ParsedFinancialData, BalanceteEntry } from "@/services/bsDados/types";
import { computeIndicators, type MonthlyDatum } from "@/services/auditDatasetBuilder";
import { generateInsights } from "@/services/auditChartsOptions";
import InsightsCard from "@/components/bsDados/InsightsCard";
import WindowSelector, { applyWindow, type Window } from "@/components/audit/WindowSelector";
import {
  EXCEL_COLORS, TITLE_STYLE, SUB_STYLE, AXIS_PROPS, GRID, TOOLTIP_STYLE, LEGEND_STYLE,
  fmtMilhar, fmtPct, fmtDec,
} from "@/components/audit/chartsCommons";

interface Props {
  parsedData: ParsedFinancialData | null;
  entries?: BalanceteEntry[];
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

const AuditCharts = ({ parsedData, entries = [] }: Props) => {
  const [win, setWin] = useState<Window>("12M");

  const fullDataset = useMemo<MonthlyDatum[]>(() => {
    const bs = buildBSDados(parsedData ?? null, entries);
    return bs.length ? bsDadosToMonthlyDataset(bs) : [];
  }, [parsedData, entries]);

  const dataset = useMemo(() => applyWindow(fullDataset, win), [fullDataset, win]);
  const insights = useMemo(() => generateInsights(dataset), [dataset]);

  if (!fullDataset.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">
            Nenhum balancete consolidado ainda. Execute o pipeline na aba <b>Balancete</b>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const series = dataset.map(d => {
    const i = computeIndicators(d);
    return {
      mes: d.mes,
      receita: Math.round(Math.abs(d.receita_liquida) / 1000),
      cmv: Math.round(Math.abs(d.cmv) / 1000),
      cmvDesp: Math.round((Math.abs(d.cmv) + Math.abs(d.despesas)) / 1000),
      resultado: Math.round(d.resultado / 1000),
      ebitda: Math.round(d.ebitda / 1000),
      cmvPct: i.cmvPct,
      cmvDespPct: i.cmvDespPct,
      margemPct: i.margemResultado,
      liqImediata: i.liquidez_imediata,
      liqCorrente: i.liquidez_corrente,
      liqSeca: i.liquidez_seca,
      liqGeral: i.liquidez_geral,
      div_tributaria: Math.round(d.divida_tributaria / 1000),
      div_trabalhista: Math.round(d.divida_trabalhista / 1000),
      div_financeira: Math.round(d.divida_financeira / 1000),
      fornecedores: Math.round(d.fornecedores / 1000),
      credores_rj: Math.round(d.credores_rj / 1000),
      outras_obrigacoes: Math.round(d.outras_obrigacoes / 1000),
      divida_total: Math.round(d.divida_total / 1000),
    };
  });

  const tipPct = (v: any) => fmtPct(Number(v));
  const tipMilhar = (v: any) => fmtMilhar(Number(v));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <InsightsCard insights={insights as any} />
        <WindowSelector value={win} onChange={setWin} available={fullDataset.length} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 1 — CMV / Receita */}
        <Tile title="CMV / RECEITA LÍQUIDA" subtitle="R$ x 1.000 + %">
          <ComposedChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis yAxisId="L" {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
            <YAxis yAxisId="R" orientation="right" domain={[-1, 1]} {...AXIS_PROPS} tickFoprospecçãotter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar yAxisId="L" dataKey="receita" name="Receita" fill={EXCEL_COLORS.azul} />
            <Bar yAxisId="L" dataKey="cmv" name="CMV" fill={EXCEL_COLORS.laranja} />
            <Line yAxisId="R" type="monotone" dataKey="cmvPct" name="% CMV/RL" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
          </ComposedChart>
        </Tile>

        {/* 2 — CMV+Desp / Receita */}
        <Tile title="CMV + DESPESA × RECEITA" subtitle="R$ x 1.000 + %">
          <ComposedChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis yAxisId="L" {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
            <YAxis yAxisId="R" orientation="right" {...AXIS_PROPS} tickFoprospecçãotter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <ReferenceLine yAxisId="R" y={1} stroke={EXCEL_COLORS.vermelho} strokeDasharray="4 4" label={{ value: "100%", fontSize: 10, fill: EXCEL_COLORS.vermelho }} />
            <Bar yAxisId="L" dataKey="receita" name="Receita" fill={EXCEL_COLORS.azul} />
            <Bar yAxisId="L" dataKey="cmvDesp" name="CMV + Desp" fill={EXCEL_COLORS.vermelho} />
            <Line yAxisId="R" type="monotone" dataKey="cmvDespPct" name="% (CMV+Desp)/RL" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
          </ComposedChart>
        </Tile>

        {/* 3 — Resultado / Receita */}
        <Tile title="RESULTADO / RECEITA" subtitle="R$ x 1.000 + margem %">
          <ComposedChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis yAxisId="L" {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
            <YAxis yAxisId="R" orientation="right" {...AXIS_PROPS} tickFoprospecçãotter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip {...TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar yAxisId="L" dataKey="receita" name="Receita" fill={EXCEL_COLORS.azul} />
            <Bar yAxisId="L" dataKey="resultado" name="Resultado" fill={EXCEL_COLORS.laranja} />
            <Line yAxisId="R" type="monotone" dataKey="margemPct" name="Margem %" stroke={EXCEL_COLORS.verde} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
          </ComposedChart>
        </Tile>

        {/* 4 — EBITDA */}
        <Tile title="EBITDA" subtitle="R$ x 1.000">
          <LineChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
            <Tooltip {...TOOLTIP_STYLE} formatter={tipMilhar} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <ReferenceLine y={0} stroke={EXCEL_COLORS.cinzaEscuro} />
            <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke={EXCEL_COLORS.ciano} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
          </LineChart>
        </Tile>

        {/* 5 — Liquidez */}
        <Tile title="ÍNDICES DE LIQUIDEZ">
          <LineChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis {...AXIS_PROPS} tickFoprospecçãotter={(v) => fmtDec(v, 1)} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => fmtDec(Number(v))} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Line type="monotone" dataKey="liqImediata" name="Imediata" stroke={EXCEL_COLORS.azul} strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="liqCorrente" name="Corrente" stroke={EXCEL_COLORS.vermelho} strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="liqSeca" name="Seca" stroke={EXCEL_COLORS.verde} strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="liqGeral" name="Geral" stroke={EXCEL_COLORS.roxo} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </Tile>

        {/* 6 — Endividamento (stacked + total) */}
        <Tile title="EVOLUÇÃO DO ENDIVIDAMENTO" subtitle="R$ x 1.000 (componentes empilhados)">
          <ComposedChart data={series} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
            {GRID}
            <XAxis dataKey="mes" {...AXIS_PROPS} />
            <YAxis yAxisId="L" {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
            <YAxis yAxisId="R" orientation="right" {...AXIS_PROPS} tickFoprospecçãotter={tipMilhar} />
            <Tooltip {...TOOLTIP_STYLE} formatter={tipMilhar} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar yAxisId="L" dataKey="div_tributaria" stackId="div" name="Tributária" fill={EXCEL_COLORS.azul} />
            <Bar yAxisId="L" dataKey="div_trabalhista" stackId="div" name="Trabalhista" fill={EXCEL_COLORS.laranja} />
            <Bar yAxisId="L" dataKey="div_financeira" stackId="div" name="Financeira" fill={EXCEL_COLORS.cinzaEscuro} />
            <Bar yAxisId="L" dataKey="fornecedores" stackId="div" name="Fornecedores" fill={EXCEL_COLORS.verde} />
            <Bar yAxisId="L" dataKey="credores_rj" stackId="div" name="Credores RJ" fill={EXCEL_COLORS.amarelo} />
            <Bar yAxisId="L" dataKey="outras_obrigacoes" stackId="div" name="Outras" fill={EXCEL_COLORS.vermelho} />
            <Line yAxisId="R" type="monotone" dataKey="divida_total" name="Dívida Total" stroke={EXCEL_COLORS.vermelho} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} />
          </ComposedChart>
        </Tile>
      </div>
    </div>
  );
};

export default AuditCharts;
