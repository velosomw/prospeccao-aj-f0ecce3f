import { FileBarChart, CheckCircle2, Eye, Download, FileText, Clock } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const rels = [
  { id: "REL-104", titulo: "Prospecção Maio/2026 - DIPLOMATA",  empresa: "DIPLOMATA",  status: "Publicado", score: 87, data: "Há 4h" },
  { id: "REL-103", titulo: "Prospecção Abril/2026 - TECNOMAX",  empresa: "TECNOMAX",   status: "Publicado", score: 72, data: "Há 1d" },
  { id: "REL-102", titulo: "Prospecção Maio/2026 - BENTOIA",    empresa: "BENTOIA",    status: "Em Revisão",score: 91, data: "Há 2d" },
  { id: "REL-101", titulo: "Prospecção Maio/2026 - MOVAG",      empresa: "MOVAG",      status: "Rascunho",  score: 41, data: "Há 3d" },
];
const statusMeta: Record<string, { bg: string; fg: string }> = {
  "Publicado":   { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  "Em Revisão":  { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
  "Rascunho":    { bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,40%)" },
};
const scoreColor = (s: number) => s < 33 ? "hsl(0,84%,55%)" : s < 67 ? "hsl(38,92%,50%)" : "hsl(142,76%,40%)";

export default function AdmRelatorios() {
  return (
    <ConsultorPageShell
      title="Relatórios" subtitle="Prospecções AJ publicados das recuperandas sob sua administração."
      kpis={[
        { label: "Publicados",    value: 47, hint: "Total geral",   icon: CheckCircle2, tone: "green" },
        { label: "Em Revisão",    value: 8,  hint: "Coordenação",   icon: Eye,          tone: "orange" },
        { label: "Rascunhos",     value: 5,  hint: "Em construção", icon: FileText,     tone: "purple" },
        { label: "Score Médio",   value: 76, hint: "Qualidade IA",  icon: FileBarChart, tone: "blue" },
        { label: "Downloads",     value: 213,hint: "30d",           icon: Download,     tone: "blue" },
        { label: "Tempo Médio",   value: "2.4d", hint: "Geração",   icon: Clock,        tone: "slate" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b"><h3 className="text-sm font-semibold">Relatórios</h3></div>
        <div className="divide-y">
          {rels.map(r => {
            const s = statusMeta[r.status];
            return (
              <div key={r.id} className="flex items-center gap-4 p-4 hover:bg-muted/20">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FileBarChart className="w-5 h-5 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-muted-foreground">{r.id}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>{r.status}</span>
                  </div>
                  <div className="text-sm font-semibold truncate">{r.titulo}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.empresa} • {r.data}</div>
                </div>
                <div className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: scoreColor(r.score) }}>{r.score}</div>
                <button className="p-2 rounded-md hover:bg-muted text-muted-foreground"><Eye className="w-4 h-4" /></button>
                <button className="p-2 rounded-md hover:bg-muted text-muted-foreground"><Download className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
      </div>
    </ConsultorPageShell>
  );
}
