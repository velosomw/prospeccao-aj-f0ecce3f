// ============================================================
// FinancialInsightsPanel — Fase 3
// Gera KPIs e gráficos automáticos a partir de bs_consolidado
// e dre_consolidado. Sem nenhum dado mockado.
// ============================================================
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, MousePointerClick } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import { useBSPNL, type BSRow, type DRERow } from "@/hooks/useBSPNL";
import KpiDrillDown, { type DrillKey } from "./KpiDrillDown";

interface Props {
  companyId: string | null;
  periodo?: { ano: number; mes: number } | null;
  runToken?: string;
}

const fmt = (v?: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Math.abs(v);
  const s = n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return v < 0 ? `(${s})` : s;
};
const pct = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`;
const ratio = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(2).replace(".", ",");

const monthLabel = (a: number, m: number) =>
  new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

// Calcula KPIs canônicos a partir de BS+DRE de um período
function calcKPIs(bs: BSRow[], dre: DRERow[]) {
  const sumBy = (sec: string, grupo?: string) =>
    bs.filter(r => r.secao === sec && (!grupo || r.grupo === grupo) && r.nivel <= 3)
      .reduce((s, r) => s + Number(r.valor || 0), 0);

  const ac  = sumBy("ativo", "circulante");
  const anc = sumBy("ativo", "nao_circulante");
  const at  = ac + anc;
  const pc  = sumBy("passivo", "circulante");
  const pnc = sumBy("passivo", "nao_circulante");
  const pt  = pc + pnc;
  const pl  = sumBy("pl");

  // DRE
  const sumDre = (cat: string) =>
    dre.filter(r => r.grupo === cat).reduce((s, r) => s + Number(r.valor || 0), 0);
  const receita = Math.abs(sumDre("receita_bruta")) - Math.abs(sumDre("deducoes"));
  const custos  = Math.abs(sumDre("custos"));
  const desp    = Math.abs(sumDre("despesas_operacionais"));
  const lucroBruto = receita - custos;
  const ebitda     = lucroBruto - desp;
  const result     = ebitda - Math.abs(sumDre("depreciacao")) - Math.abs(sumDre("amortizacao"))
                     + sumDre("resultado_financeiro") - Math.abs(sumDre("impostos"));

  return {
    // Totais
    ac, anc, at, pc, pnc, pt, pl,
    receita, custos, desp, lucroBruto, ebitda, result,
    // Indicadores
    liquidez_corrente:    pc > 0 ? ac / pc : null,
    liquidez_geral:       (pc + pnc) > 0 ? (ac + anc) / (pc + pnc) : null,
    capital_giro:         ac - pc,
    endividamento_total:  at > 0 ? pt / at : null,
    endividamento_pl:     pl > 0 ? pt / pl : null,
    margem_bruta:         receita > 0 ? lucroBruto / receita : null,
    margem_ebitda:        receita > 0 ? ebitda / receita : null,
    margem_liquida:       receita > 0 ? result / receita : null,
    roa:                  at > 0 ? result / at : null,
    roe:                  pl > 0 ? result / pl : null,
  };
}

const STATUS_COLORS = {
  good: "hsl(142,76%,36%)",
  warn: "hsl(38,92%,50%)",
  bad:  "hsl(0,84%,55%)",
} as const;

function liquidezStatus(v: number | null) {
  if (v == null) return STATUS_COLORS.warn;
  if (v >= 1.5) return STATUS_COLORS.good;
  if (v >= 1.0) return STATUS_COLORS.warn;
  return STATUS_COLORS.bad;
}
function endividamentoStatus(v: number | null) {
  if (v == null) return STATUS_COLORS.warn;
  if (v <= 0.5) return STATUS_COLORS.good;
  if (v <= 0.7) return STATUS_COLORS.warn;
  return STATUS_COLORS.bad;
}
function margemStatus(v: number | null) {
  if (v == null) return STATUS_COLORS.warn;
  if (v >= 0.10) return STATUS_COLORS.good;
  if (v >= 0)    return STATUS_COLORS.warn;
  return STATUS_COLORS.bad;
}

const FinancialInsightsPanel = ({ companyId, periodo, runToken }: Props) => {
  const { bs, dre, allBs, allDre, loading } = useBSPNL(companyId, periodo, 12, runToken);

  const k = useMemo(() => calcKPIs(bs, dre), [bs, dre]);

  const [drill, setDrill] = useState<DrillKey | null>(null);
  const [drillPeriod, setDrillPeriod] = useState<{ ano: number; mes: number } | null>(null);

  const drillBs = drillPeriod
    ? allBs.filter(r => r.ano === drillPeriod.ano && r.mes === drillPeriod.mes)
    : bs;
  const drillDre = drillPeriod
    ? allDre.filter(r => r.ano === drillPeriod.ano && r.mes === drillPeriod.mes)
    : dre;
  const drillLabel = drillPeriod
    ? monthLabel(drillPeriod.ano, drillPeriod.mes)
    : (periodo ? monthLabel(periodo.ano, periodo.mes) : undefined);

  const openDrill = (key: DrillKey, p?: { ano: number; mes: number } | null) => {
    setDrill(key);
    setDrillPeriod(p ?? null);
  };

  const labelToPeriod = useMemo(() => {
    const m = new Map<string, { ano: number; mes: number }>();
    for (const r of allBs) m.set(monthLabel(r.ano, r.mes), { ano: r.ano, mes: r.mes });
    return m;
  }, [allBs]);

  const handleChartClick = (key: DrillKey) => (e: any) => {
    const label = e?.activeLabel as string | undefined;
    const p = label ? labelToPeriod.get(label) ?? null : null;
    openDrill(key, p);
  };

  // Série temporal: KPIs por mês para gráficos de tendência
  const trend = useMemo(() => {
    const periods = Array.from(new Set(allBs.map(r => `${r.ano}-${String(r.mes).padStart(2, "0")}`))).sort();
    return periods.map(p => {
      const [ano, mes] = p.split("-").map(Number);
      const bsP  = allBs.filter(r => r.ano === ano && r.mes === mes);
      const dreP = allDre.filter(r => r.ano === ano && r.mes === mes);
      const kp   = calcKPIs(bsP, dreP);
      return {
        mes: monthLabel(ano, mes),
        liquidez: kp.liquidez_corrente,
        endividamento: kp.endividamento_total,
        margem_liquida: kp.margem_liquida,
        margem_ebitda: kp.margem_ebitda,
        ebitda: kp.ebitda,
        receita: kp.receita,
        result: kp.result,
        capital_giro: kp.capital_giro,
      };
    });
  }, [allBs, allDre]);

  // Composição de endividamento (PC vs PNC vs PL)
  const composicao = useMemo(() => ([
    { name: "Passivo Circulante", value: k.pc, color: "hsl(0,84%,55%)" },
    { name: "Passivo Não Circ.", value: k.pnc, color: "hsl(38,92%,50%)" },
    { name: "Patrimônio Líquido", value: k.pl, color: "hsl(217,91%,50%)" },
  ].filter(x => x.value > 0)), [k]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
        Calculando insights financeiros…
      </div>
    );
  }

  if (allBs.length === 0 && allDre.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-xs text-muted-foreground">
          Sem dados consolidados ainda. Rode o pipeline de balancete para gerar BS/DRE.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs principais */}
      <Card className="border-[hsl(217,91%,50%)]/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Indicadores Financeiros
            <Badge variant="secondary" className="text-[10px] ml-1">
              {periodo ? monthLabel(periodo.ano, periodo.mes) : `${trend.length} meses`}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Kpi label="Liquidez Corrente" value={ratio(k.liquidez_corrente)} color={liquidezStatus(k.liquidez_corrente)} hint="AC / PC" onClick={() => openDrill("liquidez_corrente")} />
            <Kpi label="Liquidez Geral"    value={ratio(k.liquidez_geral)}    color={liquidezStatus(k.liquidez_geral)}    hint="(AC+ANC)/(PC+PNC)" onClick={() => openDrill("liquidez_geral")} />
            <Kpi label="Endividamento"     value={pct(k.endividamento_total)} color={endividamentoStatus(k.endividamento_total)} hint="Passivo / Ativo" onClick={() => openDrill("endividamento_total")} />
            <Kpi label="Margem EBITDA"     value={pct(k.margem_ebitda)}       color={margemStatus(k.margem_ebitda)}      hint="EBITDA / Receita" onClick={() => openDrill("margem_ebitda")} />
            <Kpi label="Margem Líquida"    value={pct(k.margem_liquida)}      color={margemStatus(k.margem_liquida)}     hint="Resultado / Receita" onClick={() => openDrill("margem_liquida")} />
            <Kpi label="Capital de Giro"   value={fmt(k.capital_giro)}        color={k.capital_giro >= 0 ? STATUS_COLORS.good : STATUS_COLORS.bad} hint="AC − PC" onClick={() => openDrill("capital_giro")} />
            <Kpi label="ROA"               value={pct(k.roa)}                 color={margemStatus(k.roa)}                hint="Resultado / Ativo" onClick={() => openDrill("roa")} />
            <Kpi label="ROE"               value={pct(k.roe)}                 color={margemStatus(k.roe)}                hint="Resultado / PL" onClick={() => openDrill("roe")} />
            <Kpi label="Receita Líquida"   value={fmt(k.receita)}             color="hsl(217,91%,50%)" onClick={() => openDrill("receita")} />
            <Kpi label="EBITDA"            value={fmt(k.ebitda)}              color={k.ebitda >= 0 ? STATUS_COLORS.good : STATUS_COLORS.bad} onClick={() => openDrill("ebitda")} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <MousePointerClick className="w-3 h-3" /> Clique em um indicador ou ponto do gráfico para ver as contas que o compõem.
          </p>
        </CardContent>
      </Card>

      {/* Tendências */}
      {trend.length >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Liquidez × Endividamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trend} onClick={handleChartClick("liquidez_corrente")} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip foprospecçãotter={(v: any, name: string) => name === "Endividamento" ? pct(v) : ratio(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="liquidez" name="Liquidez Corrente" stroke="hsl(142,76%,36%)" strokeWidth={2} />
                  <Line type="monotone" dataKey="endividamento" name="Endividamento" stroke="hsl(0,84%,55%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-[hsl(258,90%,56%)]" /> Margens (EBITDA × Líquida)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trend} onClick={handleChartClick("margem_liquida")} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={10} />
                  <YAxis fontSize={10} tickFoprospecçãotter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip foprospecçãotter={(v: any) => pct(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="margem_ebitda" name="Margem EBITDA" stroke="hsl(258,90%,56%)" fill="hsl(258,90%,56%)" fillOpacity={0.18} />
                  <Area type="monotone" dataKey="margem_liquida" name="Margem Líquida" stroke="hsl(217,91%,50%)" fill="hsl(217,91%,50%)" fillOpacity={0.18} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Receita × EBITDA × Resultado</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={trend} onClick={(e: any) => {
                  const label = e?.activeLabel as string | undefined;
                  const p = label ? labelToPeriod.get(label) ?? null : null;
                  // Pega a barra clicada (receita/ebitda/result)
                  const dk = e?.activePayload?.[0]?.dataKey as DrillKey | undefined;
                  openDrill(dk ?? "ebitda", p);
                }} style={{ cursor: "pointer" }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={10} />
                  <YAxis fontSize={10} tickFoprospecçãotter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip foprospecçãotter={(v: any) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="receita" name="Receita" fill="hsl(217,91%,50%)" />
                  <Bar dataKey="ebitda" name="EBITDA" fill="hsl(258,90%,56%)" />
                  <Bar dataKey="result" name="Resultado" fill="hsl(142,76%,36%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {composicao.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Composição da Estrutura de Capital</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={composicao}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(e: any) => `${e.name}: ${pct(e.value / (k.pt + k.pl))}`}
                      onClick={(entry: any) => {
                        const name = entry?.name as string;
                        if (name?.startsWith("Passivo Circulante")) openDrill("pc");
                        else if (name?.includes("Não Circ")) openDrill("pnc");
                        else if (name?.includes("Patrimônio")) openDrill("pl");
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {composicao.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip foprospecçãotter={(v: any) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AutoAlerts k={k} />

      <KpiDrillDown
        open={drill !== null}
        onOpenChange={(v) => { if (!v) { setDrill(null); setDrillPeriod(null); } }}
        drill={drill}
        bs={drillBs}
        dre={drillDre}
        periodoLabel={drillLabel}
      />
    </div>
  );
};

const Kpi = ({ label, value, color, hint, onClick }: { label: string; value: string; color: string; hint?: string; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left rounded-lg border p-2.5 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer disabled:cursor-default"
    disabled={!onClick}
    style={{ borderColor: `${color}40`, backgroundColor: `${color}08` }}
  >
    <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color }}>{label}</p>
    <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
    {hint && <p className="text-[9px] text-muted-foreground mt-0.5">{hint}</p>}
  </button>
);

const AutoAlerts = ({ k }: { k: ReturnType<typeof calcKPIs> }) => {
  const alerts: { tipo: "ok" | "warn" | "bad"; msg: string }[] = [];
  if (k.liquidez_corrente != null && k.liquidez_corrente < 1)
    alerts.push({ tipo: "bad", msg: `Liquidez corrente ${ratio(k.liquidez_corrente)} < 1: dificuldade de honrar passivos de curto prazo.` });
  if (k.endividamento_total != null && k.endividamento_total > 0.7)
    alerts.push({ tipo: "bad", msg: `Endividamento elevado (${pct(k.endividamento_total)}) — risco de insolvência.` });
  if (k.margem_liquida != null && k.margem_liquida < 0)
    alerts.push({ tipo: "bad", msg: `Margem líquida negativa (${pct(k.margem_liquida)}) — operação consumindo caixa.` });
  if (k.capital_giro < 0)
    alerts.push({ tipo: "warn", msg: `Capital de giro negativo (${fmt(k.capital_giro)}).` });
  if (k.margem_ebitda != null && k.margem_ebitda > 0.15)
    alerts.push({ tipo: "ok", msg: `Margem EBITDA saudável (${pct(k.margem_ebitda)}).` });
  if (alerts.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Alertas Automáticos</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        {alerts.map((a, i) => {
          const Icon = a.tipo === "ok" ? CheckCircle2 : AlertTriangle;
          const color = a.tipo === "ok" ? STATUS_COLORS.good : a.tipo === "warn" ? STATUS_COLORS.warn : STATUS_COLORS.bad;
          return (
            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border" style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}>
              <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color }} />
              <span>{a.msg}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default FinancialInsightsPanel;
