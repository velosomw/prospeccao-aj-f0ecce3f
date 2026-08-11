/**
 * Container da aba "Gráficos de Auditoria".
 * Blocos: Header → Diagnóstico → 12 BEX → 6 Operacionais → KPIs → Kanitz + Pie → Alertas.
 * Conforme ABA_GRAFICOS_AUDITORIA_REPLICACAO.md §0, §10-§13.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, ChevronDown, Eye, EyeOff, AlertTriangle, CheckCircle2, Sparkles,
  TrendingUp, DollarSign, Percent, Wallet, Database,
} from "lucide-react";
import {
  ResponsiveContainer, RadialBarChart, RadialBar, PieChart, Pie, Cell, Tooltip, Legend,
} from "recharts";
import { buildBSDados, bsDadosToMonthlyDataset } from "@/services/bsDados/bsDadosBuilder";
import type { ParsedFinancialData, BalanceteEntry } from "@/services/bsDados/types";
import { applyWindow, type Window } from "./WindowSelector";
import WindowSelector from "./WindowSelector";
import AuditChartsBex from "./AuditChartsBex";
import AuditCharts from "@/components/bsDados/AuditCharts";
import { fmtMilhar, fmtPctRaw, fmtMoeda, TOOLTIP_STYLE, LEGEND_STYLE } from "./chartsCommons";

interface Props {
  parsedData: ParsedFinancialData | null;
  entries?: BalanceteEntry[];
}

const COLOR_GREEN = "hsl(150, 70%, 42%)";
const COLOR_AMBER = "hsl(34, 95%, 55%)";
const COLOR_RED = "hsl(0, 75%, 55%)";

const TabGraficosAuditoria = ({ parsedData, entries = [] }: Props) => {
  const [showDiag, setShowDiag] = useState(false);
  const [showOper, setShowOper] = useState(true);
  const [winBex, setWinBex] = useState<Window>("12M");

  const fullDataset = useMemo(() => {
    const bs = buildBSDados(parsedData ?? null, entries);
    return bs.length ? bsDadosToMonthlyDataset(bs) : [];
  }, [parsedData, entries]);

  const datasetBex = useMemo(() => applyWindow(fullDataset, winBex), [fullDataset, winBex]);

  // ── KPIs / Kanitz / Alertas a partir do último mês do dataset ─────────
  const kpis = useMemo(() => {
    if (!fullDataset.length) return null;
    const last = fullDataset[fullDataset.length - 1];
    const receita = Math.abs(last.receita_liquida);
    const custo = Math.abs(last.cmv);
    const despesas = Math.abs(last.despesas);
    const lucro = last.resultado;
    const margem = receita > 0 ? (lucro / receita) * 100 : 0;
    const ac = last.ativo_circulante, pc = last.passivo_circulante;
    const pnc = last.passivo_nao_circulante;
    const pl = last.patrimonio_liquido ?? 0;
    const estoques = last.estoques;
    const caixa = last.disponivel;

    const X1 = pl > 0 ? lucro / pl : 0;
    const X2 = pc > 0 ? ac / pc : 0;
    const X3 = pc > 0 ? (ac - estoques) / pc : 0;
    const X4 = X2;
    const X5 = pl > 0 ? (pc + pnc) / pl : 0;
    const FI = 0.05 * X1 + 1.65 * X2 + 3.55 * X3 - 1.06 * X4 - 0.33 * X5;

    return { receita, custo, despesas, lucro, margem, ac, pc, pl, caixa, estoques, FI, mes: last.mes };
  }, [fullDataset]);

  if (!fullDataset.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">
            Nenhum balancete consolidado ainda. Execute o pipeline na aba <b>Balancete</b>
            para popular os gráficos de auditoria.
          </p>
        </CardContent>
      </Card>
    );
  }

  const diag = {
    hasDRE: fullDataset.some(d => d.hasReceita),
    hasBalanco: fullDataset.some(d => d.hasBalanco),
    periodos: fullDataset.length,
  };

  // Kanitz classe
  const fi = kpis?.FI ?? 0;
  const kanitzClass = fi > 0 ? { nome: "Solvência", cor: COLOR_GREEN }
                    : fi < -3 ? { nome: "Insolvência", cor: COLOR_RED }
                              : { nome: "Penumbra", cor: COLOR_AMBER };
  const fiNoprospecçãolized = Math.max(-7, Math.min(7, fi)) + 7;

  // Pie estrutura de custos
  const pieData = kpis ? [
    { name: "Custo Operacional", value: kpis.custo, color: COLOR_RED },
    { name: "Despesas", value: kpis.despesas, color: COLOR_AMBER },
    { name: "Lucro", value: Math.max(kpis.lucro, 0), color: COLOR_GREEN },
  ].filter(d => d.value > 0) : [];

  // Alertas
  const alertas: { nivel: "critico" | "atencao" | "ok"; texto: string }[] = [];
  if (kpis) {
    if (kpis.margem < 0) alertas.push({ nivel: "critico", texto: `Margem líquida negativa (${kpis.margem.toFixed(1)}%)` });
    else if (kpis.margem < 5) alertas.push({ nivel: "atencao", texto: `Margem líquida baixa (${kpis.margem.toFixed(1)}%)` });
    if (kpis.receita > 0 && kpis.custo / kpis.receita > 0.8)
      alertas.push({ nivel: "critico", texto: `Custo acima de 80% da receita (${((kpis.custo / kpis.receita) * 100).toFixed(1)}%)` });
    if (fi < -3) alertas.push({ nivel: "critico", texto: "Kanitz indica risco de insolvência" });
    else if (fi < 0) alertas.push({ nivel: "atencao", texto: "Kanitz na faixa de penumbra" });
    if (kpis.pc > kpis.ac && kpis.ac > 0) alertas.push({ nivel: "critico", texto: "Liquidez corrente < 1" });
    if (kpis.caixa <= 0) alertas.push({ nivel: "atencao", texto: "Caixa/disponibilidades baixos ou nulos" });
  }
  if (!alertas.length) alertas.push({ nivel: "ok", texto: "Sem alertas críticos detectados" });

  // Insight IA (1 frase)
  const insightFrase = kpis
    ? kpis.margem < 0
      ? `A empresa apresenta margem negativa (${kpis.margem.toFixed(1)}%) com custo elevado — revisar estrutura operacional.`
      : kpis.margem < 5
      ? `Margem reduzida (${kpis.margem.toFixed(1)}%). Avaliar redução de custos ou reprecificação.`
      : `Operação rentável com margem de ${kpis.margem.toFixed(1)}%.`
    : "";

  const Pill = ({ on, label }: { on: boolean; label: string }) => (
    <div className={`flex items-center gap-2 p-2 rounded border text-xs ${on ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700" : "border-red-500/40 bg-red-500/5 text-red-700"}`}>
      {on ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </div>
  );

  const KPI = ({ label, value, color, icon: Icon }: any) => (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <p className="text-xl font-bold font-mono" style={{ color }}>{value}</p>
      </CardContent>
    </Card>
  );

  const alertBg = (n: string) => n === "critico" ? "bg-red-500/10 border-red-500/40 text-red-700"
                              : n === "atencao" ? "bg-amber-500/10 border-amber-500/40 text-amber-700"
                              : "bg-emerald-500/10 border-emerald-500/40 text-emerald-700";

  return (
    <div className="space-y-4">
      {/* 1 — Header */}
      <Card className="border-[hsl(217,91%,50%)]/20 bg-[hsl(217,91%,50%)]/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[hsl(217,91%,50%)]" />
            Gráficos de Auditoria — Balancete
            <Badge variant="outline" className="text-[10px]">{diag.periodos} meses</Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* 2 — Diagnóstico colapsável */}
      <Card className="border-[hsl(34,95%,55%)]/30 bg-[hsl(34,95%,55%)]/5">
        <CardContent className="py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-[hsl(34,95%,55%)]" />
            <span className="font-medium">Diagnóstico da extração</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5"
                  aria-expanded={showDiag} onClick={() => setShowDiag(v => !v)}>
            {showDiag ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDiag ? "rotate-180" : ""}`} />
          </Button>
        </CardContent>
        {showDiag && (
          <CardContent className="pt-0 pb-3 grid grid-cols-2 md:grid-cols-3 gap-2">
            <Pill on={diag.hasDRE} label="DRE detectada" />
            <Pill on={diag.hasBalanco} label="Balanço detectado" />
            <Pill on={diag.periodos > 0} label={`${diag.periodos} períodos detectados`} />
          </CardContent>
        )}
      </Card>

      {/* 3 — 12 Gráficos BEX */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">12 Gráficos BEX (Aba "GRÁFICOS 2")</h3>
        <WindowSelector value={winBex} onChange={setWinBex} available={fullDataset.length} />
      </div>
      <AuditChartsBex data={datasetBex} />

      {/* 4 — 6 Indicadores operacionais (colapsável) */}
      <Card>
        <CardContent className="py-3 flex items-center justify-between">
          <span className="text-sm font-semibold">6 Indicadores Operacionais</span>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5"
                  aria-expanded={showOper} onClick={() => setShowOper(v => !v)}>
            {showOper ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOper ? "rotate-180" : ""}`} />
          </Button>
        </CardContent>
      </Card>
      {showOper && <AuditCharts parsedData={parsedData} entries={entries} />}

      {/* 5 — KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Receita" value={fmtMoeda(kpis.receita)} color="hsl(217, 91%, 50%)" icon={DollarSign} />
          <KPI label="Lucro" value={fmtMoeda(kpis.lucro)} color={kpis.lucro >= 0 ? COLOR_GREEN : COLOR_RED} icon={TrendingUp} />
          <KPI label="Margem" value={fmtPctRaw(kpis.margem, 1)} color={kpis.margem >= 0 ? COLOR_GREEN : COLOR_RED} icon={Percent} />
          <KPI label="Caixa" value={fmtMoeda(kpis.caixa)} color="hsl(189, 85%, 45%)" icon={Wallet} />
        </div>
      )}

      {/* 6 — Insight IA */}
      {insightFrase && (
        <Card className="border-[hsl(258,90%,66%)]/30 bg-[hsl(258,90%,66%)]/5">
          <CardContent className="py-3 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-[hsl(258,90%,66%)] mt-0.5" />
            <p className="text-sm">{insightFrase}</p>
          </CardContent>
        </Card>
      )}

      {/* 7 — Kanitz + Pie */}
      {kpis && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Kanitz — Fator de Insolvência</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <RadialBarChart
                    innerRadius="65%" outerRadius="100%"
                    startAngle={180} endAngle={0}
                    data={[{ name: "FI", value: fiNoprospecçãolized, fill: kanitzClass.cor }]}
                  >
                    <RadialBar dataKey="value" background={{ fill: "hsl(var(--muted))" }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono" style={{ color: kanitzClass.cor }}>
                  {fi.toFixed(2).replace(".", ",")}
                </p>
                <Badge style={{ backgroundColor: `${kanitzClass.cor}22`, borderColor: kanitzClass.cor, color: kanitzClass.cor }}>
                  {kanitzClass.nome}
                </Badge>
                <p className="text-[10px] text-muted-foreground mt-2">
                  FI &gt; 0 Solvência · −3 ≤ FI ≤ 0 Penumbra · FI &lt; −3 Insolvência
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Estrutura de Custos ({kpis.mes})</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={100} label={(e: any) => e.name}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} foprospecçãotter={(v: any) => fmtMilhar(Number(v))} />
                    <Legend wrapperStyle={LEGEND_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 8 — Alertas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Alertas Inteligentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alertas.map((a, i) => (
            <div key={i} className={`px-3 py-2 rounded border text-xs ${alertBg(a.nivel)}`}>
              {a.texto}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default TabGraficosAuditoria;
