import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar,
} from "recharts";
import { useBSPNL, type DRERow } from "@/hooks/useBSPNL";
import FinancialInsightsPanel from "./FinancialInsightsPanel";
import PeriodRangeSelector from "./PeriodRangeSelector";
import VariacaoBadge from "./VariacaoBadge";
import AutoAlertsCard from "./AutoAlertsCard";
import { listPeriods, inRange, dreTotalsByPeriod, dreDerived, periodKey, previousMonthKey, previousYearKey } from "@/lib/financialVariations";

const fmt = (v?: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.abs(v);
  const s = n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return v < 0 ? `(${s})` : s;
};
const pct = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`;

const monthLabel = (a: number, m: number) =>
  new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

const CAT_LABEL: Record<string, string> = {
  receita_bruta: "Receita Bruta",
  deducoes: "(-) Deduções",
  receita_liquida: "Receita Líquida",
  custos: "(-) Custos / CMV",
  lucro_bruto: "Lucro Bruto",
  despesas_operacionais: "(-) Despesas Operacionais",
  ebitda: "EBITDA",
  depreciacao: "(-) Depreciação",
  amortizacao: "(-) Amortização",
  resultado_financeiro: "Resultado Financeiro",
  resultado_antes_impostos: "Resultado antes Impostos",
  impostos: "(-) Impostos",
  resultado_liquido: "Resultado Líquido",
};

const ORDER = ["receita_bruta", "deducoes", "custos", "despesas_operacionais", "depreciacao", "amortizacao", "resultado_financeiro", "impostos"];

interface Props {
  companyId: string | null;
  periodo?: { ano: number; mes: number } | null;
  runToken?: string;
  janela?: { from: { ano: number; mes: number }; to: { ano: number; mes: number } } | null;
}

function aggregate(rows: DRERow[]) {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    const cat = r.grupo || "despesas_operacionais";
    acc[cat] = (acc[cat] || 0) + Number(r.valor || 0);
  }
  const receita_bruta = Math.abs(acc["receita_bruta"] || 0);
  const deducoes = -Math.abs(acc["deducoes"] || 0);
  const receita_liquida = receita_bruta + deducoes;
  const custos = -Math.abs(acc["custos"] || 0);
  const lucro_bruto = receita_liquida + custos;
  const despesas = -Math.abs(acc["despesas_operacionais"] || 0);
  const depreciacao = -Math.abs(acc["depreciacao"] || 0);
  const amortizacao = -Math.abs(acc["amortizacao"] || 0);
  const ebitda = lucro_bruto + despesas;
  const resultado_financeiro = acc["resultado_financeiro"] || 0;
  const resultado_antes_impostos = ebitda + depreciacao + amortizacao + resultado_financeiro;
  const impostos = -Math.abs(acc["impostos"] || 0);
  const resultado_liquido = resultado_antes_impostos + impostos;
  return {
    receita_bruta, deducoes, receita_liquida, custos, lucro_bruto, despesas_operacionais: despesas,
    depreciacao, amortizacao, ebitda, resultado_financeiro, resultado_antes_impostos, impostos, resultado_liquido,
    margem_bruta: receita_liquida ? lucro_bruto / receita_liquida : null,
    margem_ebitda: receita_liquida ? ebitda / receita_liquida : null,
    margem_liquida: receita_liquida ? resultado_liquido / receita_liquida : null,
  };
}

const ProspecçãoDRETab = ({ companyId, periodo, runToken, janela }: Props) => {
  const { dre, allDre, loading, building, build, periodos } = useBSPNL(
    companyId, periodo, 12, runToken, janela ?? null,
  );

  const aggregated = useMemo(() => aggregate(dre), [dre]);

  // Fase 6 — intervalo customizado (de → até)
  const periodList = useMemo(() => listPeriods(allDre), [allDre]);
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);
  const effectiveFrom = rangeFrom ?? (periodList[0]?.key ?? null);
  const effectiveTo = rangeTo ?? (periodList[periodList.length - 1]?.key ?? null);
  const dreInRange = useMemo(
    () => allDre.filter(r => inRange({ ano: r.ano, mes: r.mes }, effectiveFrom, effectiveTo)),
    [allDre, effectiveFrom, effectiveTo],
  );

  // Variações MoM / YoY
  const totalsByPer = useMemo(() => dreTotalsByPeriod(allDre), [allDre]);
  const refKey = periodo ? periodKey(periodo.ano, periodo.mes) : (periodList[periodList.length - 1]?.key ?? null);
  const refRaw = refKey ? totalsByPer.get(refKey) : null;
  const momRaw = refRaw ? totalsByPer.get(previousMonthKey(refRaw.ano, refRaw.mes)) : null;
  const yoyRaw = refRaw ? totalsByPer.get(previousYearKey(refRaw.ano, refRaw.mes)) : null;
  const refD = refRaw ? dreDerived(refRaw) : null;
  const momD = momRaw ? dreDerived(momRaw) : null;
  const yoyD = yoyRaw ? dreDerived(yoyRaw) : null;

  // Série temporal (respeita o intervalo)
  const serie = useMemo(() => {
    const byPer = new Map<string, DRERow[]>();
    for (const r of dreInRange) {
      const k = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
      if (!byPer.has(k)) byPer.set(k, []);
      byPer.get(k)!.push(r);
    }
    return Array.from(byPer.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, list]) => {
      const [ano, mes] = k.split("-").map(Number);
      const a = aggregate(list);
      return {
        mes: monthLabel(ano, mes),
        receita: a.receita_liquida,
        custos: -a.custos,
        despesas: -a.despesas_operacionais,
        ebitda: a.ebitda,
        resultado: a.resultado_liquido,
      };
    });
  }, [dreInRange]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />Carregando DRE…</div>;
  }

  const lines: { cat: string; bold?: boolean; isTotal?: boolean }[] = [
    { cat: "receita_bruta" },
    { cat: "deducoes" },
    { cat: "receita_liquida", bold: true, isTotal: true },
    { cat: "custos" },
    { cat: "lucro_bruto", bold: true, isTotal: true },
    { cat: "despesas_operacionais" },
    { cat: "ebitda", bold: true, isTotal: true },
    { cat: "depreciacao" },
    { cat: "amortizacao" },
    { cat: "resultado_financeiro" },
    { cat: "impostos" },
    { cat: "resultado_liquido", bold: true, isTotal: true },
  ];

  return (
    <div className="space-y-4">
      <AutoAlertsCard companyId={companyId} runToken={runToken} />
      <Card className="border-[hsl(258,90%,56%)]/20">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[hsl(258,90%,56%)]" />
                Demonstração de Resultados (P&amp;L)
                <span className="text-xs text-muted-foreground font-noprospecçãol">
                  {periodos.length} {periodos.length === 1 ? "competência" : "competências"}
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {janela
                  ? `DRE somada · ${monthLabel(janela.from.ano, janela.from.mes)} → ${monthLabel(janela.to.ano, janela.to.mes)}`
                  : periodo ? `Visão pontual: ${monthLabel(periodo.ano, periodo.mes)}` : "Consolidado de todos os meses disponíveis"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {aggregated.resultado_liquido >= 0 ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                  <TrendingUp className="w-3 h-3 mr-1" /> Lucro
                </Badge>
              ) : (
                <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30">
                  <TrendingDown className="w-3 h-3 mr-1" /> Prejuízo
                </Badge>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={build} disabled={building || !companyId}>
                {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Reprocessar DRE
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {dre.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Nenhum dado de DRE ainda. Clique em <b>Reprocessar DRE</b> para derivar do balancete.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                <KpiCard label="Receita Líquida" value={aggregated.receita_liquida} color="hsl(217,91%,50%)"
                  mom={refD?.receita_liquida} momPrev={momD?.receita_liquida}
                  yoy={refD?.receita_liquida} yoyPrev={yoyD?.receita_liquida} />
                <KpiCard label="Lucro Bruto" value={aggregated.lucro_bruto} sub={pct(aggregated.margem_bruta)} color="hsl(170,60%,40%)"
                  mom={refD?.lucro_bruto} momPrev={momD?.lucro_bruto}
                  yoy={refD?.lucro_bruto} yoyPrev={yoyD?.lucro_bruto} />
                <KpiCard label="EBITDA" value={aggregated.ebitda} sub={pct(aggregated.margem_ebitda)} color="hsl(258,90%,56%)"
                  mom={refD?.ebitda} momPrev={momD?.ebitda}
                  yoy={refD?.ebitda} yoyPrev={yoyD?.ebitda} />
                <KpiCard label="Resultado Líquido" value={aggregated.resultado_liquido} sub={pct(aggregated.margem_liquida)}
                  color={aggregated.resultado_liquido >= 0 ? "hsl(142,76%,36%)" : "hsl(0,84%,55%)"}
                  mom={refD?.resultado_liquido} momPrev={momD?.resultado_liquido}
                  yoy={refD?.resultado_liquido} yoyPrev={yoyD?.resultado_liquido} />
              </div>
              {periodList.length >= 2 && (
                <div className="mb-3 pb-2 border-b">
                  <PeriodRangeSelector
                    periodos={periodList}
                    from={effectiveFrom}
                    to={effectiveTo}
                    onChange={(f, t) => { setRangeFrom(f); setRangeTo(t); }}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Gráficos abaixo respeitam o intervalo selecionado.
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="border-b-2 text-muted-foreground">
                      <th className="text-left py-2 px-2 font-semibold w-2/3">Categoria</th>
                      <th className="text-right px-2 font-semibold">Valor</th>
                      <th className="text-right px-2 font-semibold w-20">AV%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(({ cat, bold, isTotal }) => {
                      const v = (aggregated as any)[cat] as number;
                      const av = aggregated.receita_liquida ? Math.abs(v) / aggregated.receita_liquida : null;
                      return (
                        <tr key={cat}
                          className={`border-b border-border/20 ${isTotal ? "bg-muted/40" : ""} ${bold ? "font-semibold" : ""}`}>
                          <td className="py-1.5 px-2">{CAT_LABEL[cat]}</td>
                          <td className={`text-right px-2 ${v < 0 ? "text-rose-600" : v > 0 && bold ? "text-emerald-700" : ""}`}>
                            {fmt(v)}
                          </td>
                          <td className="text-right px-2 text-muted-foreground">{pct(av)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Gráficos */}
      {serie.length >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Receita × Custos × Despesas</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={10} />
                  <YAxis fontSize={10} tickFoprospecçãotter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip foprospecçãotter={(v: any) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="receita" name="Receita" fill="hsl(217,91%,50%)" />
                  <Bar dataKey="custos" name="Custos" fill="hsl(0,84%,55%)" />
                  <Bar dataKey="despesas" name="Despesas" fill="hsl(38,92%,50%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">EBITDA × Resultado Líquido</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={10} />
                  <YAxis fontSize={10} tickFoprospecçãotter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip foprospecçãotter={(v: any) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="hsl(258,90%,56%)" strokeWidth={2} />
                  <Line type="monotone" dataKey="resultado" name="Resultado" stroke="hsl(142,76%,36%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Insights automáticos (Fase 3) */}
      <FinancialInsightsPanel companyId={companyId} periodo={periodo} runToken={runToken} />
    </div>
  );
};

const KpiCard = ({ label, value, sub, color, mom, momPrev, yoy, yoyPrev }: {
  label: string; value: number; sub?: string; color: string;
  mom?: number | null; momPrev?: number | null; yoy?: number | null; yoyPrev?: number | null;
}) => (
  <div className="rounded-lg border p-3" style={{ borderColor: `${color}40`, backgroundColor: `${color}08` }}>
    <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color }}>{label}</p>
    <p className="text-lg font-bold tabular-nums mt-1">{fmt(value)}</p>
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">Margem: {sub}</p>}
    {(mom != null || yoy != null) && (
      <div className="flex gap-1 mt-1.5 flex-wrap">
        <VariacaoBadge label="MoM" current={mom} previous={momPrev} />
        <VariacaoBadge label="YoY" current={yoy} previous={yoyPrev} />
      </div>
    )}
  </div>
);

export default ProspecçãoDRETab;
