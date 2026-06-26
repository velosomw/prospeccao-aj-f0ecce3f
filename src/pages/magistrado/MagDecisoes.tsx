import { Gavel, CheckCircle2, AlertTriangle, FileText, Clock, Scale } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const decisoes = [
  { id: "DEC-1102", proc: "RJ-2024-0012", empresa: "DIPLOMATA",  tipo: "Concessão RJ",        resultado: "Deferido", data: "Hoje 14:32" },
  { id: "DEC-1101", proc: "RJ-2024-0014", empresa: "TECNOMAX",   tipo: "Aprovação plano",     resultado: "Deferido", data: "Ontem" },
  { id: "DEC-1100", proc: "RJ-2023-0089", empresa: "MOVAG",      tipo: "Convolação falência", resultado: "Indeferido", data: "07/05" },
  { id: "DEC-1099", proc: "RJ-2024-0009", empresa: "BENTOIA",    tipo: "Habilitação crédito", resultado: "Parcial",  data: "05/05" },
  { id: "DEC-1098", proc: "RJ-2023-0076", empresa: "CONSTRUTEX", tipo: "Encerramento RJ",     resultado: "Deferido", data: "02/05" },
];
const resultMeta: Record<string, { bg: string; fg: string }> = {
  "Deferido":   { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)" },
  "Indeferido": { bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)"   },
  "Parcial":    { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)"  },
};

export default function MagDecisoes() {
  return (
    <ConsultorPageShell
      title="Decisões" subtitle="Histórico de despachos, sentenças e deliberações."
      kpis={[
        { label: "Total (30d)",  value: 28, hint: "Proferidas",     icon: Gavel,        tone: "blue" },
        { label: "Deferidas",    value: 19, hint: "Aprovadas",      icon: CheckCircle2, tone: "green" },
        { label: "Indeferidas",  value: 4,  hint: "Negadas",        icon: AlertTriangle, tone: "red" },
        { label: "Parciais",     value: 5,  hint: "Em parte",       icon: Scale,        tone: "orange" },
        { label: "Pendentes",    value: 4,  hint: "Para deliberar", icon: Clock,        tone: "purple" },
        { label: "Tempo Médio",  value: "14d", hint: "Para decisão",icon: Clock,        tone: "slate" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b"><h3 className="text-sm font-semibold">Decisões Recentes</h3></div>
        <div className="divide-y">
          {decisoes.map(d => {
            const m = resultMeta[d.resultado];
            return (
              <div key={d.id} className="flex items-center gap-4 p-4 hover:bg-muted/20">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Gavel className="w-5 h-5 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-mono text-primary font-semibold">{d.id}</span>
                    <span className="text-xs font-mono text-muted-foreground">• {d.proc}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: m.bg, color: m.fg }}>{d.resultado}</span>
                  </div>
                  <div className="text-sm font-semibold">{d.tipo}</div>
                  <div className="text-xs text-muted-foreground">{d.empresa} • {d.data}</div>
                </div>
                <button className="p-2 rounded-md hover:bg-muted text-muted-foreground"><FileText className="w-4 h-4" /></button>
              </div>
            );
          })}
        </div>
      </div>
    </ConsultorPageShell>
  );
}
