import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, FileSpreadsheet, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar,
} from "recharts";
import { useBSPNL, type BSRow } from "@/hooks/useBSPNL";
import FinancialInsightsPanel from "./FinancialInsightsPanel";
import PeriodRangeSelector from "./PeriodRangeSelector";
import VariacaoBadge from "./VariacaoBadge";
import AutoAlertsCard from "./AutoAlertsCard";
import { listPeriods, inRange, bsTotalsByPeriod, periodKey, previousMonthKey, previousYearKey } from "@/lib/financialVariations";

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

interface Props {
  companyId: string | null;
  periodo?: { ano: number; mes: number } | null;
  runToken?: string;
  janela?: { from: { ano: number; mes: number }; to: { ano: number; mes: number } } | null;
}

const SECTION_TITLES: Record<string, string> = {
  ativo: "ATIVO",
  passivo: "PASSIVO",
  pl: "PATRIMÔNIO LÍQUIDO",
};

const GRUPO_TITLES: Record<string, string> = {
  circulante: "Circulante",
  nao_circulante: "Não Circulante",
  patrimonio_liquido: "Patrimônio Líquido",
};

function groupBySecaoGrupo(rows: BSRow[]) {
  const map = new Map<string, Map<string, BSRow[]>>();
  for (const r of rows) {
    if (!map.has(r.secao)) map.set(r.secao, new Map());
    const g = r.grupo || "outros";
    if (!map.get(r.secao)!.has(g)) map.get(r.secao)!.set(g, []);
    map.get(r.secao)!.get(g)!.push(r);
  }
  return map;
}

const ProspeccaoBalancoTab = ({ companyId, periodo, runToken, janela }: Props) => {
  // Quando há janela (3M/6M/12M), o BP usa o SALDO do mês mais recente
  // contido nela (regra contábil: saldos não somam). `bs` recebido aqui é
  // pós-filtragem da janela; precisamos isolar o mês mais recente para a
  // tabela hierárquica e KPIs.
  const { bs: bsAll, allBs, periodos, loading, building, build } = useBSPNL(
    companyId, periodo, 12, runToken, janela ?? null,
  );
  const bs = useMemo(() => {
    if (!janela) return bsAll;
    if (bsAll.length === 0) return bsAll;
    let maxKey = "";
    for (const r of bsAll) {
      const k = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
      if (k > maxKey) maxKey = k;
    }
    return bsAll.filter(r => `${r.ano}-${String(r.mes).padStart(2, "0")}` === maxKey);
  }, [bsAll, janela]);

  // Fase 6 — intervalo customizado (de → até)
  const periodList = useMemo(() => listPeriods(allBs), [allBs]);
  const [rangeFrom, setRangeFrom] = useState<string | null>(null);
  const [rangeTo, setRangeTo] = useState<string | null>(null);
  const effectiveFrom = rangeFrom ?? (periodList[0]?.key ?? null);
  const effectiveTo = rangeTo ?? (periodList[periodList.length - 1]?.key ?? null);
  const bsInRange = useMemo(
    () => allBs.filter(r => inRange({ ano: r.ano, mes: r.mes }, effectiveFrom, effectiveTo)),
    [allBs, effectiveFrom, effectiveTo],
  );

  const grouped = useMemo(() => groupBySecaoGrupo(bs), [bs]);

  // Totais
  const totals = useMemo(() => {
    const t = { ativo: 0, passivo: 0, pl: 0 };
    for (const r of bs) {
      if (r.nivel <= 2) {
        if (r.secao === "ativo") t.ativo += Number(r.valor || 0);
        else if (r.secao === "passivo") t.passivo += Number(r.valor || 0);
        else if (r.secao === "pl") t.pl += Number(r.valor || 0);
      }
    }
    const diff = Math.abs(t.ativo - (t.passivo + t.pl));
    const diffPct = t.ativo > 0 ? diff / t.ativo : 0;
    return { ...t, diff, diffPct, ok: diffPct <= 0.005 };
  }, [bs]);

  // Fase 6 — variações MoM / YoY com base no período de referência
  const totalsByPer = useMemo(() => bsTotalsByPeriod(allBs), [allBs]);
  const refKey = periodo ? periodKey(periodo.ano, periodo.mes) : (periodList[periodList.length - 1]?.key ?? null);
  const refTotals = refKey ? totalsByPer.get(refKey) ?? null : null;
  const momTotals = refTotals ? totalsByPer.get(previousMonthKey(refTotals.ano, refTotals.mes)) ?? null : null;
  const yoyTotals = refTotals ? totalsByPer.get(previousYearKey(refTotals.ano, refTotals.mes)) ?? null : null;

  // Série temporal — Ativo / Passivo / PL ao longo dos meses (filtrada pelo intervalo)
  const evolucao = useMemo(() => {
    const byPer = new Map<string, { mes: string; ativo: number; passivo: number; pl: number }>();
    for (const r of bsInRange) {
      if (r.nivel > 2) continue;
      const k = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
      if (!byPer.has(k)) byPer.set(k, { mes: monthLabel(r.ano, r.mes), ativo: 0, passivo: 0, pl: 0 });
      const obj = byPer.get(k)!;
      if (r.secao === "ativo") obj.ativo += Number(r.valor || 0);
      else if (r.secao === "passivo") obj.passivo += Number(r.valor || 0);
      else if (r.secao === "pl") obj.pl += Number(r.valor || 0);
    }
    return Array.from(byPer.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [bsInRange]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />Carregando Balanço…</div>;
  }

  return (
    <div className="space-y-4">
      <AutoAlertsCard companyId={companyId} runToken={runToken} />
      {/* Header / actions */}
      <Card className="border-[hsl(217,91%,50%)]/20">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                Balanço Patrimonial (BS)
                <span className="text-xs text-muted-foreground font-normal">
                  Derivado do Balancete · {periodos.length} {periodos.length === 1 ? "competência" : "competências"}
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {janela
                  ? `Saldo BP em ${monthLabel(janela.to.ano, janela.to.mes)} · janela ${monthLabel(janela.from.ano, janela.from.mes)} → ${monthLabel(janela.to.ano, janela.to.mes)}`
                  : periodo ? `Visão pontual: ${monthLabel(periodo.ano, periodo.mes)}` : "Visão consolidada (todos os meses)"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {totals.ok ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> A = P + PL
                </Badge>
              ) : (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Δ {pct(totals.diffPct)}
                </Badge>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={build} disabled={building || !companyId}>
                {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Reprocessar BS
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bs.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Nenhum dado de BS ainda. Clique em <b>Reprocessar BS</b> para derivar do balancete.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-emerald-50/50 border border-emerald-200 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Ativo Total</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-900 mt-1">{fmt(totals.ativo)}</p>
                  <div className="flex gap-1 mt-1.5">
                    <VariacaoBadge label="MoM" current={refTotals?.ativo} previous={momTotals?.ativo} />
                    <VariacaoBadge label="YoY" current={refTotals?.ativo} previous={yoyTotals?.ativo} />
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50/50 border border-rose-200 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-rose-700 font-semibold">Passivo Total</p>
                  <p className="text-lg font-bold tabular-nums text-rose-900 mt-1">{fmt(totals.passivo)}</p>
                  <div className="flex gap-1 mt-1.5">
                    <VariacaoBadge label="MoM" current={refTotals?.passivo} previous={momTotals?.passivo} invert />
                    <VariacaoBadge label="YoY" current={refTotals?.passivo} previous={yoyTotals?.passivo} invert />
                  </div>
                </div>
                <div className="rounded-lg bg-indigo-50/50 border border-indigo-200 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-indigo-700 font-semibold">Patrimônio Líquido</p>
                  <p className="text-lg font-bold tabular-nums text-indigo-900 mt-1">{fmt(totals.pl)}</p>
                  <div className="flex gap-1 mt-1.5">
                    <VariacaoBadge label="MoM" current={refTotals?.pl} previous={momTotals?.pl} />
                    <VariacaoBadge label="YoY" current={refTotals?.pl} previous={yoyTotals?.pl} />
                  </div>
                </div>
              </div>
              {periodList.length >= 2 && (
                <div className="pt-2 border-t">
                  <PeriodRangeSelector
                    periodos={periodList}
                    from={effectiveFrom}
                    to={effectiveTo}
                    onChange={(f, t) => { setRangeFrom(f); setRangeTo(t); }}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Gráfico de evolução respeita o intervalo selecionado.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela hierárquica */}
      {bs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ATIVO */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{SECTION_TITLES.ativo}</CardTitle></CardHeader>
            <CardContent>
              <SectionTable rows={bs.filter(r => r.secao === "ativo")} />
            </CardContent>
          </Card>
          {/* PASSIVO + PL */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{SECTION_TITLES.passivo} + {SECTION_TITLES.pl}</CardTitle></CardHeader>
            <CardContent>
              <SectionTable rows={[...bs.filter(r => r.secao === "passivo"), ...bs.filter(r => r.secao === "pl")]} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráficos de evolução */}
      {evolucao.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[hsl(217,91%,50%)]" />
              Evolução Patrimonial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" fontSize={10} />
                <YAxis fontSize={10} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(v: any) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="ativo" name="Ativo" stroke="hsl(142,76%,36%)" fill="hsl(142,76%,36%)" fillOpacity={0.18} />
                <Area type="monotone" dataKey="passivo" name="Passivo" stroke="hsl(0,84%,55%)" fill="hsl(0,84%,55%)" fillOpacity={0.18} />
                <Area type="monotone" dataKey="pl" name="Patrimônio Líq." stroke="hsl(258,90%,56%)" fill="hsl(258,90%,56%)" fillOpacity={0.18} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Insights automáticos (Fase 3) */}
      <FinancialInsightsPanel companyId={companyId} periodo={periodo} runToken={runToken} />
    </div>
  );
};

const SectionTable = ({ rows }: { rows: BSRow[] }) => {
  const grouped = useMemo(() => {
    const m = new Map<string, BSRow[]>();
    for (const r of rows) {
      const g = r.grupo || "outros";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    return m;
  }, [rows]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 px-2 font-semibold">Conta</th>
            <th className="text-right px-2 font-semibold">Valor</th>
            <th className="text-right px-2 font-semibold w-16">AV%</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(grouped.entries()).map(([grupo, list]) => {
            const total = list.filter(r => r.nivel <= 2).reduce((s, r) => s + Number(r.valor || 0), 0);
            return (
              <>
                <tr key={`g-${grupo}`} className="bg-muted/40 font-semibold">
                  <td className="py-1.5 px-2">{GRUPO_TITLES[grupo] || grupo}</td>
                  <td className="text-right px-2">{fmt(total)}</td>
                  <td className="text-right px-2 text-muted-foreground">—</td>
                </tr>
                {list.sort((a, b) => a.codigo.localeCompare(b.codigo)).slice(0, 30).map(r => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="py-1 px-2" style={{ paddingLeft: 8 + r.nivel * 6 }}>
                      <span className="text-muted-foreground mr-1">{r.codigo}</span>
                      {r.descricao}
                    </td>
                    <td className="text-right px-2">{fmt(r.valor)}</td>
                    <td className="text-right px-2 text-muted-foreground">{pct(r.av_pct)}</td>
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ProspeccaoBalancoTab;
