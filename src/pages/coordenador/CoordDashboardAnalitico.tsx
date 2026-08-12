import { useMemo } from "react";
import {
  Briefcase, Users, CheckCircle2, Award,
  TrendingUp, Activity,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, LabelList,
} from "recharts";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { useUser } from "@/contexts/UserContext";
import { useCompaniesStats } from "@/hooks/useCompaniesStats";
import { useTeamStats } from "@/hooks/useTeamStats";

const COLORS = {
  blue: "hsl(217,91%,50%)", purple: "hsl(258,90%,55%)",
  green: "hsl(142,76%,40%)", orange: "hsl(38,92%,50%)", red: "hsl(0,84%,55%)",
};

export default function Dashboard() {
  const { userName } = useUser();
  const { data: statsData } = useCompaniesStats("all");
  const { data: teamData } = useTeamStats("consultor");

  const stats = useMemo(() => {
    const bs = statsData?.byStatus ?? {};
    const total = statsData?.total ?? 0;
    const ativos = (bs["ativa"] || 0) + (bs["em_analise"] || 0) + (bs["em_revisao"] || 0);
    const equipe = teamData?.length ?? 0;
    const aprovacoes = bs["em_revisao"] || 0;
    const scoreMedio = teamData?.length 
      ? Math.round(teamData.reduce((acc, m) => acc + (m.score_medio || 0), 0) / teamData.length)
      : 0;
    const slaMedio = teamData?.length
      ? Math.round(teamData.reduce((acc, m) => acc + (m.sla_medio || 0), 0) / teamData.length)
      : 0;

    return {
      total,
      ativos,
      equipe,
      aprovacoes,
      sla: slaMedio ? `${slaMedio}%` : "—",
      score: scoreMedio,
    };
  }, [statsData, teamData]);

  const distStatus = useMemo(() => {
    const bs = statsData?.byStatus ?? {};
    return [
      { name: "Em Análise IA", value: bs["em_analise"] || 0, color: COLORS.purple },
      { name: "Em Revisão",    value: bs["em_revisao"] || 0, color: COLORS.orange },
      { name: "Aprovação",     value: bs["concluido"] || 0,  color: COLORS.blue   },
      { name: "Concluídos",    value: bs["concluido"] || 0, color: COLORS.green  },
    ];
  }, [statsData]);

  const consultoresList = teamData || [];
  const equipeBar = consultoresList.map(c => ({ 
    name: (c.full_name || "Consultor").split(" ")[0], 
    prospecções: c.prospeccoes_count || 0 
  }));

  const evolucao = [
    { m: "Jan", v: Math.floor(stats.total * 0.4) },
    { m: "Fev", v: Math.floor(stats.total * 0.6) },
    { m: "Mar", v: Math.floor(stats.total * 0.8) },
    { m: "Abr", v: stats.total },
  ];

  return (
    <ConsultorPageShell
      title={`Olá, ${userName?.split(" ")[0] || "Coordenador"}!`}
      subtitle="Visão executiva da operação, equipe e aprovações pendentes."
      kpis={[
        { label: "Prospeccoes AJ Totais",       value: stats.total,      hint: "Período atual",    icon: Briefcase,    tone: "blue" },
        { label: "Em Andamento",      value: stats.ativos,     hint: "Pipelines ativos", icon: Activity,     tone: "purple" },
        { label: "Aprovações",        value: stats.aprovacoes, hint: "Aguardando você",  icon: CheckCircle2, tone: "orange" },
        { label: "Equipe",            value: stats.equipe,     hint: "Consultores",      icon: Users,        tone: "blue" },
        { label: "SLA Cumprido",      value: stats.sla,        hint: "Últimos 30d",      icon: TrendingUp,   tone: "green" },
        { label: "Score Médio",       value: stats.score,      hint: "Qualidade global", icon: Award,        tone: "blue" },
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold mb-3">Distribuição por Status</h3>
          <div className="h-[200px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={distStatus} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78}
                  stroke="white" strokeWidth={2} paddingAngle={3}>
                  {distStatus.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {distStatus.map(d => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: d.color }} />{d.name}</div>
                <span className="font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold mb-3">Prospeccoes AJ por Consultor</h3>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={equipeBar} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="prospecções" fill={COLORS.blue} radius={[8,8,0,0]} maxBarSize={42}>
                  <LabelList dataKey="prospecções" position="top" style={{ fontSize: 11, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold mb-3">Evolução Mensal</h3>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <LineChart data={evolucao} margin={{ top: 24, right: 16, left: 8, bottom: 0 }}>
                <XAxis dataKey="m" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Line type="monotone" dataKey="v" stroke={COLORS.blue} strokeWidth={2.5}
                  dot={{ r: 5, fill: "white", stroke: COLORS.blue, strokeWidth: 2.5 }}>
                  <LabelList dataKey="v" position="top" style={{ fontSize: 11, fontWeight: 700 }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold">Aprovações Pendentes</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">{stats.aprovacoes}</span>
          </div>
          <div className="divide-y max-h-[300px] overflow-y-auto">
            {stats.aprovacoes === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma aprovação pendente.</div>
            ) : (
              <div className="p-4 text-xs text-muted-foreground">Verifique a lista de empresas em revisão no menu lateral.</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Performance da Equipe</h3>
          </div>
          <div className="divide-y max-h-[300px] overflow-y-auto">
            {consultoresList.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhum consultor cadastrado.</div>
            ) : (
              consultoresList.map(c => (
                <div key={c.user_id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {(c.full_name || "C").split(" ").map(n => n[0]).join("").slice(0,2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{c.full_name || c.email}</div>
                    <div className="text-xs text-muted-foreground">{c.prospeccoes_count} Prospecções ativos</div>
                  </div>
                  <div className="w-32">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.score_medio}%`, background: (c.score_medio || 0) < 67 ? COLORS.orange : COLORS.green }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 text-right">Score {c.score_medio}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ConsultorPageShell>
  );
}
