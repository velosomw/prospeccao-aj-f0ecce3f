import { Briefcase, CheckCircle2, Eye, AlertTriangle, Award, Building2, MoreVertical } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const rmas = [
  { id: "RMA-0012", empresa: "DIPLOMATA",  periodo: "05/2026", status: "Concluído",   score: 87 },
  { id: "RMA-0014", empresa: "TECNOMAX",   periodo: "04/2026", status: "Em Revisão",  score: 72 },
  { id: "RMA-0009", empresa: "BENTOIA",    periodo: "05/2026", status: "Concluído",   score: 91 },
  { id: "RMA-0011", empresa: "MOVAG",      periodo: "05/2026", status: "Em Análise",  score: 41 },
  { id: "RMA-0008", empresa: "CONSTRUTEX", periodo: "04/2026", status: "Concluído",   score: 78 },
];
const statusMeta: Record<string, { bg: string; fg: string }> = {
  "Em Análise":  { bg: "hsl(258,90%,96%)", fg: "hsl(258,90%,40%)" },
  "Em Revisão":  { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  "Concluído":   { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
};
const scoreColor = (s: number) => s < 33 ? "hsl(0,84%,55%)" : s < 67 ? "hsl(38,92%,50%)" : "hsl(142,76%,40%)";

export default function AdmRMAs() {
  return (
    <ConsultorPageShell
      title="Prospecções AJ" subtitle="Relatórios de monitoramento das recuperandas administradas."
      kpis={[
        { label: "Prospecções AJ Vigentes", value: 47, hint: "Em produção", icon: Briefcase, tone: "blue" },
        { label: "Concluídos",    value: 22, hint: "30d",         icon: CheckCircle2, tone: "green" },
        { label: "Em Revisão",    value: 6,  hint: "Coordenação", icon: Eye,         tone: "orange" },
        { label: "Em Análise",    value: 14, hint: "IA",          icon: AlertTriangle, tone: "purple" },
        { label: "Score Médio",   value: 74, hint: "Portfólio",   icon: Award,       tone: "blue" },
        { label: "Empresas",      value: 16, hint: "Cobertura",   icon: Building2,   tone: "blue" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b"><h3 className="text-sm font-semibold">Prospecções AJ em Curso</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">ID</th>
              <th className="text-left px-4 py-2.5">Empresa</th>
              <th className="text-left px-4 py-2.5">Período</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Score</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rmas.map(r => {
              const s = statusMeta[r.status];
              return (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-primary font-semibold">{r.id}</td>
                  <td className="px-4 py-3 font-medium">{r.empresa}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.periodo}</td>
                  <td className="px-4 py-3"><span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: s.bg, color: s.fg }}>{r.status}</span></td>
                  <td className="px-4 py-3"><div className="w-7 h-7 rounded-full text-white text-[11px] font-bold flex items-center justify-center" style={{ background: scoreColor(r.score) }}>{r.score}</div></td>
                  <td className="px-4 py-3 text-right"><button className="text-muted-foreground hover:text-foreground"><MoreVertical className="w-4 h-4" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ConsultorPageShell>
  );
}
