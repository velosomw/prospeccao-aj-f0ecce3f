import { Calendar, Clock, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const eventos: any[] = [];

const statusMeta: Record<string, { bg: string; fg: string; label: string }> = {
  futuro: { bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)", label: "Próximo" },
  ok:     { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", label: "Concluído" },
};

export default function RecCronograma() {
  return (
    <ConsultorPageShell
      title="Cronograma" subtitle="Calendário de obrigações e marcos do processo."
      kpis={[
        { label: "Próximas (30d)", value: 4,  hint: "Agendadas",  icon: Calendar,     tone: "blue" },
        { label: "Próxima",        value: "8d", hint: "Balancete",icon: Clock,        tone: "orange" },
        { label: "Cumpridas (30d)",value: 12, hint: "No prazo",   icon: CheckCircle2, tone: "green" },
        { label: "Atrasadas",      value: 1,  hint: "Recuperar",  icon: AlertTriangle, tone: "red" },
        { label: "Total Anuais",   value: 24, hint: "Marcos",     icon: FileText,     tone: "purple" },
        { label: "Aderência",      value: "92%", hint: "Compliance", icon: CheckCircle2, tone: "green" },
      ]}
    >
      <div className="bg-white rounded-xl border p-5">
        <div className="relative pl-8">
          <div className="absolute left-3 top-1 bottom-1 w-px bg-border" />
          <div className="space-y-5">
            {eventos.map(e => {
              const s = statusMeta[e.status];
              return (
                <div key={e.data + e.item} className="relative">
                  <div className="absolute -left-[22px] w-7 h-7 rounded-full flex items-center justify-center" style={{ background: s.bg }}>
                    <Calendar className="w-3.5 h-3.5" style={{ color: s.fg }} />
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
                      <span className="text-xs font-mono text-primary">{e.data}</span>
                    </div>
                    <div className="text-sm font-semibold">{e.item}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ConsultorPageShell>
  );
}
