import { CheckCircle2, AlertTriangle, Clock, Eye, Building2, ArrowRight } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const aprovacoes: any[] = [];


const scoreColor = (s: number) => s < 33 ? "hsl(0,84%,55%)" : s < 67 ? "hsl(38,92%,50%)" : "hsl(142,76%,40%)";

export default function CoordAprovacoes() {
  return (
    <ConsultorPageShell
      title="Aprovações" subtitle="Prospeccoes AJ aguardando sua revisão e assinatura."
      kpis={[
        { label: "Aguardando",      value: aprovacoes.length, hint: "Total na fila",    icon: Clock,        tone: "orange" },
        { label: "Críticas",        value: aprovacoes.filter(a => a.critico).length, hint: "Vence hoje",   icon: AlertTriangle, tone: "red" },
        { label: "Aprovadas (30d)", value: 0, hint: "Concluídas",                       icon: CheckCircle2, tone: "green" },
        { label: "Reprovadas",      value: 0,  hint: "Para revisão",                     icon: AlertTriangle, tone: "red" },
        { label: "Tempo Médio",     value: "—", hint: "Para aprovação",                icon: Clock,        tone: "blue" },
        { label: "Score Médio",     value: 0, hint: "Da fila atual",                    icon: Eye,          tone: "purple" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold">Fila de Aprovação</h3>
          <div className="flex gap-2">
            <button className="text-xs font-semibold border px-3 py-1.5 rounded-md hover:bg-muted">Aprovar em lote</button>
          </div>
        </div>
        <div className="divide-y">
          {aprovacoes.map(a => (
            <div key={a.id} className="flex items-center gap-4 p-4 hover:bg-muted/20">
              <div className="w-1 h-12 rounded-full" style={{ background: a.critico ? "hsl(0,84%,55%)" : "hsl(217,91%,50%)" }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono font-semibold text-primary">{a.id}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{a.periodo}</span>
                  <span className={`text-xs font-semibold ${a.critico ? "text-red-600" : "text-orange-600"}`}>{a.sla}</span>
                </div>
                <div className="text-sm font-semibold flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-muted-foreground" />{a.empresa}</div>
                <div className="text-xs text-muted-foreground mt-0.5">por {a.consultor}</div>
              </div>
              <div className="w-10 h-10 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: scoreColor(a.score) }}>{a.score}</div>
              <button className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Revisar <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ConsultorPageShell>
  );
}
