import { History, Gavel, FileText, CheckCircle2, AlertTriangle, User } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const events = [
  { id: "MH-401", tipo: "decisao",   titulo: "Decisão proferida - DIPLOMATA",  proc: "RJ-2024-0012", autor: "Magistrado", data: "Hoje 14:32" },
  { id: "MH-400", tipo: "audiencia", titulo: "AGC realizada - TECNOMAX",        proc: "RJ-2024-0014", autor: "Magistrado", data: "Hoje 11:00" },
  { id: "MH-399", tipo: "prospecção",       titulo: "Prospeccao-0009 visualizado",            proc: "RJ-2024-0009", autor: "Magistrado", data: "Ontem" },
  { id: "MH-398", tipo: "decisao",   titulo: "Despacho assinado",               proc: "RJ-2023-0076", autor: "Magistrado", data: "07/05" },
  { id: "MH-397", tipo: "audiencia", titulo: "Audiência inicial",               proc: "RJ-2024-0014", autor: "Magistrado", data: "06/05" },
];
const typeMeta: Record<string, { icon: any; bg: string; fg: string; label: string }> = {
  decisao:   { icon: Gavel,         bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)", label: "Decisão" },
  audiencia: { icon: CheckCircle2,  bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", label: "Audiência" },
  prospecção:       { icon: FileText,      bg: "hsl(258,90%,96%)", fg: "hsl(258,90%,45%)", label: "Prospeccao AJ" },
};

export default function MagHistorico() {
  return (
    <ConsultorPageShell
      title="Histórico" subtitle="Trilha de atos jurisdicionais."
      kpis={[
        { label: "Eventos (30d)", value: 88, hint: "Total",     icon: History,      tone: "blue" },
        { label: "Decisões",      value: 28, hint: "Proferidas",icon: Gavel,        tone: "purple" },
        { label: "Audiências",    value: 22, hint: "Realizadas",icon: CheckCircle2, tone: "green" },
        { label: "Prospecções AJ Lidos",    value: 14, hint: "Análises",  icon: FileText,     tone: "blue" },
        { label: "Pendências",    value: 4,  hint: "Em aberto", icon: AlertTriangle, tone: "red" },
        { label: "Usuários",      value: 1,  hint: "Gabinete",  icon: User,         tone: "slate" },
      ]}
    >
      <div className="bg-white rounded-xl border p-5">
        <div className="relative pl-8">
          <div className="absolute left-3 top-1 bottom-1 w-px bg-border" />
          <div className="space-y-5">
            {events.map(e => {
              const m = typeMeta[e.tipo];
              const Icon = m.icon;
              return (
                <div key={e.id} className="relative">
                  <div className="absolute -left-[22px] w-7 h-7 rounded-full flex items-center justify-center" style={{ background: m.bg }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: m.fg }} />
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                      <span className="text-xs font-mono text-primary">{e.proc}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{e.data}</span>
                    </div>
                    <div className="text-sm font-medium">{e.titulo}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><User className="w-3 h-3" />{e.autor}</div>
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
