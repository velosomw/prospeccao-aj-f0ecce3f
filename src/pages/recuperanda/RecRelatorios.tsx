import { FileBarChart, CheckCircle2, Eye, Download, Award } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const rels = [
  { id: "REL-104", periodo: "05/2026", status: "Publicado",  score: 87, data: "Há 4h" },
  { id: "REL-103", periodo: "04/2026", status: "Publicado",  score: 72, data: "Há 1m" },
  { id: "REL-102", periodo: "03/2026", status: "Publicado",  score: 91, data: "Há 2m" },
  { id: "REL-101", periodo: "02/2026", status: "Publicado",  score: 78, data: "Há 3m" },
];
const scoreColor = (s: number) => s < 33 ? "hsl(0,84%,55%)" : s < 67 ? "hsl(38,92%,50%)" : "hsl(142,76%,40%)";

export default function RecRelatorios() {
  return (
    <ConsultorPageShell
      title="Meus Relatórios" subtitle="Prospecções AJ publicados sobre seu processo de recuperação."
      kpis={[
        { label: "Publicados",  value: rels.length, hint: "Total",       icon: CheckCircle2, tone: "green" },
        { label: "Score Atual", value: 87, hint: "Último Prospecção AJ",           icon: Award,        tone: "green" },
        { label: "Score Médio", value: 82, hint: "Histórico",            icon: FileBarChart, tone: "blue" },
        { label: "Tendência",   value: "↑ 5pts", hint: "Vs período anterior", icon: Award,   tone: "green" },
        { label: "Downloads",   value: 12, hint: "30d",                  icon: Download,     tone: "purple" },
        { label: "Próxima Entrega", value: "20/05", hint: "Prospecção AJ Jun/2026",icon: FileBarChart, tone: "orange" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b"><h3 className="text-sm font-semibold">Histórico de Prospecções AJ</h3></div>
        <div className="divide-y">
          {rels.map(r => (
            <div key={r.id} className="flex items-center gap-4 p-4 hover:bg-muted/20">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><FileBarChart className="w-5 h-5 text-primary" /></div>
              <div className="flex-1">
                <div className="text-xs font-mono text-muted-foreground">{r.id}</div>
                <div className="text-sm font-semibold">RMA Período {r.periodo}</div>
                <div className="text-xs text-muted-foreground">{r.status} • {r.data}</div>
              </div>
              <div className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: scoreColor(r.score) }}>{r.score}</div>
              <button className="p-2 rounded-md hover:bg-muted text-muted-foreground"><Eye className="w-4 h-4" /></button>
              <button className="p-2 rounded-md hover:bg-muted text-muted-foreground"><Download className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>
    </ConsultorPageShell>
  );
}
