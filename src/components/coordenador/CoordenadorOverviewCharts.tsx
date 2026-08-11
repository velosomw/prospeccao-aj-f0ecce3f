import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, PieChart as PieIcon, BarChart3, Activity, Target, Layers } from "lucide-react";
import type { Company, CompanyConsultant, RmaHistoryEntry } from "@/services/companiesService";

type ProfileLite = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  updated_at: string;
};

interface Props {
  companies: Company[];
  assignments: CompanyConsultant[];
  history: RmaHistoryEntry[];
  profiles: ProfileLite[];
}

const COLOR_BLUE = "hsl(217, 91%, 50%)";
const COLOR_NAVY = "hsl(222, 47%, 14%)";
const COLOR_PURPLE = "hsl(258, 90%, 66%)";
const COLOR_GREEN = "hsl(142, 76%, 36%)";
const COLOR_ORANGE = "hsl(38, 92%, 50%)";
const COLOR_RED = "hsl(0, 84%, 60%)";
const COLOR_CYAN = "hsl(190, 90%, 50%)";

const monthsPt = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const CoordenadorOverviewCharts = ({ companies, assignments, history, profiles }: Props) => {
  // 1. Status dos Prospeccaos (saúde do portfólio)
  const statusData = useMemo(() => {
    const buckets: Record<string, number> = { ativo: 0, pendente: 0, inativo: 0, concluido: 0 };
    companies.forEach((c) => {
      const s = (c.status || "ativo").toLowerCase();
      if (buckets[s] === undefined) buckets[s] = 0;
      buckets[s] += 1;
    });
    return [
      { name: "Ativos", value: buckets.ativo || 0, color: COLOR_GREEN },
      { name: "Pendentes", value: buckets.pendente || 0, color: COLOR_ORANGE },
      { name: "Concluídos", value: buckets.concluido || 0, color: COLOR_BLUE },
      { name: "Inativos", value: buckets.inativo || 0, color: COLOR_RED },
    ].filter((d) => d.value > 0);
  }, [companies]);

  // 2. Distribuição por consultor (top 6)
  const consultorData = useMemo(() => {
    const counts = new Map<string, number>();
    assignments.forEach((a) => {
      counts.set(a.consultant_user_id, (counts.get(a.consultant_user_id) || 0) + 1);
    });
    const arr = Array.from(counts.entries()).map(([uid, count]) => {
      const p = profiles.find((x) => x.user_id === uid);
      const name = p?.full_name?.split(" ")[0] || "—";
      return { name, prospeccaos: count };
    });
    return arr.sort((a, b) => b.prospeccaos - a.prospeccaos).slice(0, 6);
  }, [assignments, profiles]);

  // 3. Cadastros por mês (últimos 6 meses)
  const cadastrosData = useMemo(() => {
    const now = new Date();
    const out: { month: string; prospeccaos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = companies.filter((c) => {
        const t = new Date(c.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      }).length;
      out.push({ month: monthsPt[d.getMonth()], prospeccaos: count });
    }
    return out;
  }, [companies]);

  // 4. Movimentações nos últimos 14 dias
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

  // 5. Distribuição de usuários por papel
  const rolesData = useMemo(() => {
    const map: Record<string, number> = {};
    profiles.forEach((p) => {
      map[p.role] = (map[p.role] || 0) + 1;
    });
    const labels: Record<string, { label: string; color: string }> = {
      coordenador: { label: "Coordenador", color: COLOR_BLUE },
      consultor: { label: "Consultor", color: COLOR_PURPLE },
      magistrado: { label: "Magistrado", color: COLOR_NAVY },
      recuperanda: { label: "Empresa Prospeccao", color: COLOR_ORANGE },
      gestor_ia: { label: "Gestor IA", color: COLOR_CYAN },
    };
    return Object.entries(map).map(([role, value]) => ({
      name: labels[role]?.label || role,
      value,
      color: labels[role]?.color || COLOR_NAVY,
    }));
  }, [profiles]);

  // 6. Distribuição por setor (top 5)
  const setorData = useMemo(() => {
    const map = new Map<string, number>();
    companies.forEach((c) => {
      const s = c.sector || "Outros";
      map.set(s, (map.get(s) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [companies]);

  // KPIs estratégicos
  const totalAssigned = assignments.length;
  const coverage = companies.length > 0 ? Math.round((totalAssigned / companies.length) * 100) : 0;
  const consultoresAtivos = profiles.filter((p) => p.role === "consultor" && p.active).length;
  const cargaMedia = consultoresAtivos > 0 ? (totalAssigned / consultoresAtivos).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      {/* Métricas estratégicas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-4" style={{ borderLeftColor: COLOR_BLUE }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cobertura</p>
              <Target className="w-4 h-4" style={{ color: COLOR_BLUE }} />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{coverage}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{totalAssigned} de {companies.length} Prospeccaos atribuídos</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: COLOR_PURPLE }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Carga Média</p>
              <Layers className="w-4 h-4" style={{ color: COLOR_PURPLE }} />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{cargaMedia}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Prospecções AJ por consultor ativo</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: COLOR_GREEN }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Atividade 14d</p>
              <Activity className="w-4 h-4" style={{ color: COLOR_GREEN }} />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
              {movimentacoesData.reduce((s, d) => s + d.total, 0)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Movimentações nos últimos 14 dias</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: COLOR_ORANGE }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Setores</p>
              <PieIcon className="w-4 h-4" style={{ color: COLOR_ORANGE }} />
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{setorData.length}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Setores econômicos atendidos</p>
          </CardContent>
        </Card>
      </div>

      {/* Linha 1: Status (Pizza) + Carga por Consultor (Barras) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieIcon className="w-4 h-4" style={{ color: COLOR_BLUE }} /> Status dos Prospeccaos
            </CardTitle>
            <CardDescription>Distribuição da saúde do portfólio</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {statusData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
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
              <BarChart3 className="w-4 h-4" style={{ color: COLOR_PURPLE }} /> Carga por Consultor
            </CardTitle>
            <CardDescription>Top 6 consultores por nº de Prospecções AJ</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {consultorData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem atribuições.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={consultorData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Bar dataKey="prospeccaos" fill={COLOR_PURPLE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linha 2: Cadastros (Linha) + Movimentações 14d (Área) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" style={{ color: COLOR_GREEN }} /> Cadastros de Prospeccao — 6 meses
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
                <Line
                  type="monotone"
                  dataKey="prospeccaos"
                  stroke={COLOR_BLUE}
                  strokeWidth={3}
                  dot={{ r: 5, fill: COLOR_BLUE }}
                  activeDot={{ r: 7 }}
                />
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
                  <linearGradient id="movGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_ORANGE} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={COLOR_ORANGE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip />
                <Area type="monotone" dataKey="total" stroke={COLOR_ORANGE} strokeWidth={2} fill="url(#movGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Linha 3: Usuários por papel + Setores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieIcon className="w-4 h-4" style={{ color: COLOR_CYAN }} /> Usuários por Perfil
            </CardTitle>
            <CardDescription>Composição da base de usuários da plataforma</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {rolesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rolesData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {rolesData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
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
              <BarChart3 className="w-4 h-4" style={{ color: COLOR_NAVY }} /> Setores Atendidos
            </CardTitle>
            <CardDescription>Top 5 setores econômicos por volume de Prospecções AJ</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {setorData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={setorData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                  <Bar dataKey="value" fill={COLOR_NAVY} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CoordenadorOverviewCharts;
