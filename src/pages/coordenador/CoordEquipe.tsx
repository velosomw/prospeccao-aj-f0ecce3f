import { Users, Award, Activity, Briefcase, AlertTriangle, Plus } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const team = [
  { nome: "Ana Silva",      email: "ana@bex.com",      prospeccoes: 12, score: 87, sla: 96, status: "Ativo" },
  { nome: "Carlos Mendes",  email: "carlos@bex.com",   prospeccoes: 9,  score: 74, sla: 90, status: "Ativo" },
  { nome: "Fernanda Costa", email: "fernanda@bex.com", prospeccoes: 7,  score: 91, sla: 98, status: "Ativo" },
  { nome: "Rafael Souza",   email: "rafael@bex.com",   prospeccoes: 5,  score: 62, sla: 84, status: "Sobrecarga" },
  { nome: "Julia Pereira",  email: "julia@bex.com",    prospeccoes: 4,  score: 80, sla: 92, status: "Ativo" },
];

const statusColor = (s: string) => s === "Sobrecarga" ? { bg: "hsl(38,92%,95%)", fg: "hsl(38,92%,40%)" } : { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" };

export default function CoordEquipe() {
  const totalProspeccoes = team.reduce((s, t) => s + t.prospeccoes, 0);
  const avgScore  = Math.round(team.reduce((s, t) => s + t.score, 0) / team.length);
  const avgSLA    = Math.round(team.reduce((s, t) => s + t.sla, 0) / team.length);
  return (
    <ConsultorPageShell
      title="Equipe" subtitle="Gestão de consultores, carga e performance individual."
      kpis={[
        { label: "Consultores",   value: team.length, hint: "Ativos",         icon: Users,        tone: "blue" },
        { label: "Prospecções AJ Atribuídos", value: totalProspeccoes, hint: "Total da equipe",icon: Briefcase,    tone: "purple" },
        { label: "Score Médio",   value: avgScore,    hint: "Qualidade",      icon: Award,        tone: "green" },
        { label: "SLA Médio",     value: `${avgSLA}%`, hint: "Cumprimento",    icon: Activity,     tone: "blue" },
        { label: "Sobrecarga",    value: team.filter(t => t.status === "Sobrecarga").length, hint: "Atenção", icon: AlertTriangle, tone: "orange" },
        { label: "Disponíveis",   value: 2,           hint: "Capacidade livre", icon: Users,      tone: "green" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold">Membros</h3>
          <button className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary px-3 py-1.5 rounded-md hover:opacity-90">
            <Plus className="w-3.5 h-3.5" /> Convidar consultor
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Consultor</th>
              <th className="text-left px-4 py-2.5">Prospecções AJ</th>
              <th className="text-left px-4 py-2.5">Score</th>
              <th className="text-left px-4 py-2.5">SLA</th>
              <th className="text-left px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {team.map(t => {
              const s = statusColor(t.status);
              return (
                <tr key={t.email} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                      {t.nome.split(" ").map(n => n[0]).join("").slice(0,2)}
                    </div>
                    <div>
                      <div className="font-medium">{t.nome}</div>
                      <div className="text-xs text-muted-foreground">{t.email}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">{t.prospeccoes}</td>
                  <td className="px-4 py-3"><span className="font-semibold">{t.score}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 w-32">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${t.sla}%` }} />
                      </div>
                      <span className="text-xs font-semibold w-9">{t.sla}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>{t.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ConsultorPageShell>
  );
}
