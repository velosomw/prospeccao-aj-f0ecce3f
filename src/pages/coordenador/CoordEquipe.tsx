import { Users, Award, Activity, Briefcase, AlertTriangle, Plus, Loader2 } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { useTeamStats } from "@/hooks/useTeamStats";

const statusColor = (s: string) => s === "Sobrecarga" ? { bg: "hsl(38,92%,95%)", fg: "hsl(38,92%,40%)" } : { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" };

export default function CoordEquipe() {
  const { data: team = [], isLoading } = useTeamStats("consultor");

  const totalProspeccoes = team.reduce((s, t) => s + (t.prospeccoes_count || 0), 0);
  const avgScore  = team.length ? Math.round(team.reduce((s, t) => s + (t.score_medio || 0), 0) / team.length) : 0;
  const avgSLA    = team.length ? Math.round(team.reduce((s, t) => s + (t.sla_medio || 0), 0) / team.length) : 0;

  return (
    <ConsultorPageShell
      title="Equipe" subtitle="Gestão de consultores, carga e performance individual."
      kpis={[
        { label: "Consultores",   value: team.length, hint: "Ativos",         icon: Users,        tone: "blue" },
        { label: "Prospeccoes AJ Atribuídos", value: totalProspeccoes, hint: "Total da equipe",icon: Briefcase,    tone: "purple" },
        { label: "Score Médio",   value: avgScore,    hint: "Qualidade",      icon: Award,        tone: "green" },
        { label: "SLA Médio",     value: `${avgSLA}%`, hint: "Cumprimento",    icon: Activity,     tone: "blue" },
        { label: "Sobrecarga",    value: team.filter(t => (t.prospeccoes_count || 0) > 5).length, hint: "Atenção", icon: AlertTriangle, tone: "orange" },
        { label: "Disponíveis",   value: team.filter(t => (t.prospeccoes_count || 0) < 3).length,           hint: "Capacidade livre", icon: Users,      tone: "green" },

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
              <th className="text-left px-4 py-2.5">Prospeccoes AJ</th>
              <th className="text-left px-4 py-2.5">Score</th>
              <th className="text-left px-4 py-2.5">SLA</th>
              <th className="text-left px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando equipe...
                  </div>
                </td>
              </tr>
            ) : team.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum consultor cadastrado.
                </td>
              </tr>
            ) : (
              team.map(t => {
                const statusStr = (t.prospeccoes_count || 0) > 5 ? "Sobrecarga" : "Disponível";
                const s = statusColor(statusStr);
                return (
                  <tr key={t.user_id} className="border-t hover:bg-muted/20">
                    <td className="px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                        {(t.full_name || "C").split(" ").map(n => n[0]).join("").slice(0,2)}
                      </div>
                      <div>
                        <div className="font-medium">{t.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{t.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">{t.prospeccoes_count}</td>
                    <td className="px-4 py-3"><span className="font-semibold">{t.score_medio}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 w-32">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${t.sla_medio}%` }} />
                        </div>
                        <span className="text-xs font-semibold w-9">{t.sla_medio}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>{statusStr}</span>
                    </td>
                  </tr>
                );
              })
            )}

          </tbody>
        </table>
      </div>
    </ConsultorPageShell>
  );
}
