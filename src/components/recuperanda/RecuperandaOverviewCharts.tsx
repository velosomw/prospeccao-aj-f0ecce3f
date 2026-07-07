import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, PieChart as PieIcon, BarChart3, Activity, Target, Layers } from "lucide-react";
import type { Company, RmaHistoryEntry } from "@/services/companiesService";
import type { RmaAnalysisResult } from "@/services/rmaAnalysisService";

interface Props {
  companies: Company[];
  history: RmaHistoryEntry[];
  analyses: Record<string, RmaAnalysisResult>;
}

const COLOR_BLUE = "hsl(217, 91%, 50%)";
const COLOR_NAVY = "hsl(222, 47%, 14%)";
const COLOR_PURPLE = "hsl(258, 90%, 66%)";
const COLOR_GREEN = "hsl(142, 76%, 36%)";
const COLOR_ORANGE = "hsl(38, 92%, 50%)";
const COLOR_RED = "hsl(0, 84%, 60%)";

const monthsPt = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const RecuperandaOverviewCharts = ({ companies, history, analyses }: Props) => {
  // Status (saúde) — usa analyses.status quando disponível, senão company.status
  const statusData = useMemo(() => {
    const buckets = { ativo: 0, em_analise: 0, concluido: 0, pendente: 0 };
    companies.forEach((c) => {
      const a = analyses[c.id];
      if (a?.status === "concluido") buckets.concluido += 1;
      else if (a?.status === "em_analise") buckets.em_analise += 1;
      else if ((c.status || "ativo").toLowerCase() === "ativo") buckets.ativo += 1;
      else buckets.pendente += 1;
    });
    return [
      { name: "Concluídos", value: buckets.concluido, color: COLOR_GREEN },
      { name: "Em Análise", value: buckets.em_analise, color: COLOR_ORANGE },
      { name: "Ativos", value: buckets.ativo, color: COLOR_BLUE },
      { name: "Pendentes", value: buckets.pendente, color: COLOR_RED },
    ].filter((d) => d.value > 0);
  }, [companies, analyses]);

  // Conformidade por empresa (top 8)
  const conformidadeData = useMemo(() => {
    return companies
      .map((c) => ({ name: c.name.length > 14 ? c.name.slice(0, 12) + "…" : c.name, pct: analyses[c.id]?.percentual ?? 0 }))
      .filter((d) => d.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  }, [companies, analyses]);

  // Cadastros por mês (6m)
  const cadastrosData = useMemo(() => {
    const now = new Date();
    const out: { month: string; rmas: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = companies.filter((c) => {
        const t = new Date(c.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      out.push({ month: monthsPt[d.getMonth()], rmas: count });
    }
    return out;
  }, [companies]);

  // Movimentações 14d
  const movimentacoesData = useMemo(() => {
    const days = 14;
    const out: { day: string; total: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
      const total = history.filter((h) => {
        const t = new Date(h.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      out.push({ day: `${d.getDate()}/${d.getMonth() + 1}`, total });
    }
    return out;
  }, [history]);

  // Setores
  const setorData = useMemo(() => {
    const map = new Map<string, number>();
    companies.forEach((c) => {
      const s = c.sector || "Outros";
      map.set(s, (map.get(s) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [companies]);

  const concluidos = statusData.find((s) => s.name === "Concluídos")?.value ?? 0;
  const emAnalise = statusData.find((s) => s.name === "Em Análise")?.value ?? 0;
  const total = companies.length;
  const avgPct = total > 0
    ? Math.round(companies.reduce((s, c) => s + (analyses[c.id]?.percentual ?? 0), 0) / total)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-4" style={{ borderLeftColor: COLOR_BLUE }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Empresas</p>
              <Target className="w-4 h-4" style={{ color: COLOR_BLUE }} />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{total}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Ligadas à recuperanda</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: COLOR_GREEN }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Conformidade Média</p>
              <Layers className="w-4 h-4" style={{ color: COLOR_GREEN }} />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{avgPct}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Média dos Prospecções AJ</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: COLOR_ORANGE }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Em Análise</p>
              <Activity className="w-4 h-4" style={{ color: COLOR_ORANGE }} />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{emAnalise}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Prospecções AJ sendo processados</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: COLOR_PURPLE }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Concluídos</p>
              <PieIcon className="w-4 h-4" style={{ color: COLOR_PURPLE }} />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{concluidos}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Prospecções AJ entregues</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieIcon className="w-4 h-4" style={{ color: COLOR_BLUE }} /> Status dos RMAs
            </CardTitle>
            <CardDescription>Distribuição da saúde do portfólio</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {statusData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4" style={{ color: COLOR_PURPLE }} /> Conformidade por Empresa
            </CardTitle>
            <CardDescription>Top 8 empresas por % de conformidade</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {conformidadeData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conformidadeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} formatter={(v: any) => `${v}%`} />
                  <Bar dataKey="pct" fill={COLOR_PURPLE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: COLOR_GREEN }} /> Cadastros de RMA — 6 meses
            </CardTitle>
            <CardDescription>Evolução mensal dos novos Prospecções AJ</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cadastrosData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip />
                <Line type="monotone" dataKey="rmas" stroke={COLOR_BLUE} strokeWidth={3} dot={{ r: 5, fill: COLOR_BLUE }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: COLOR_ORANGE }} /> Movimentações — 14 dias
            </CardTitle>
            <CardDescription>Pulso diário das atribuições e movimentações</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={movimentacoesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="movGradRec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_ORANGE} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={COLOR_ORANGE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip />
                <Area type="monotone" dataKey="total" stroke={COLOR_ORANGE} strokeWidth={2} fill="url(#movGradRec)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" style={{ color: COLOR_NAVY }} /> Setores Atendidos
          </CardTitle>
          <CardDescription>Top 5 setores por volume</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          {setorData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={setorData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="value" fill={COLOR_NAVY} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RecuperandaOverviewCharts;
