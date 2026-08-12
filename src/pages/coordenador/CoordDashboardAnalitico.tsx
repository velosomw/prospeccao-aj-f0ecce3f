import { useMemo } from "react";
import {
  Briefcase, Users, CheckCircle2, AlertTriangle, Award, Building2,
  TrendingUp, Activity,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, LabelList,
} from "recharts";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { useUser } from "@/contexts/UserContext";

const COLORS = {
  blue: "hsl(217,91%,50%)", purple: "hsl(258,90%,55%)",
  green: "hsl(142,76%,40%)", orange: "hsl(38,92%,50%)", red: "hsl(0,84%,55%)",
};

const consultores: any[] = [];


const aprovacoes: any[] = [];


const distStatus = [
  { name: "Em Análise IA", value: 0, color: COLORS.purple },
  { name: "Em Revisão",    value: 0, color: COLORS.orange },
  { name: "Aprovação",     value: 0,  color: COLORS.blue   },
  { name: "Concluídos",    value: 0, color: COLORS.green  },
];

const evolucao: any[] = [];


const equipeBar = consultores.map(c => ({ name: c.nome.split(" ")[0], prospecções: c.prospecções }));

export default function Dashboard() {
  const { userName } = useUser();

  const stats = useMemo(() => ({
    total: 0, ativos: 0, equipe: consultores.length, aprovacoes: aprovacoes.length, sla: "—", score: 0,
  }), []);

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
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">{aprovacoes.length}</span>
          </div>
          <div className="divide-y">
            {aprovacoes.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 hover:bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-primary">{a.id}</span>
                    <span className="text-xs text-red-600 font-medium">{a.sla}</span>
                  </div>
                  <div className="text-sm font-medium truncate">{a.empresa}</div>
                  <div className="text-xs text-muted-foreground">{a.consultor}</div>
                </div>
                <div className="w-9 h-9 rounded-full bg-blue-50 text-primary text-xs font-bold flex items-center justify-center">{a.score}</div>
                <button className="text-xs font-semibold text-primary hover:underline">Revisar</button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold">Perfoprospeccaonce da Equipe</h3>
          </div>
          <div className="divide-y">
            {consultores.map(c => (
              <div key={c.nome} className="flex items-center gap-3 p-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {c.nome.split(" ").map(n => n[0]).join("").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">{c.prospecções} Prospeccoes ativos</div>
                </div>
                <div className="w-32">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: c.score < 67 ? COLORS.orange : COLORS.green }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 text-right">Score {c.score}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ConsultorPageShell>
  );
}
