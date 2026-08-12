import { History, GitCommit, User, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

interface Ev { id: string; tipo: "criacao"|"edicao"|"aprovacao"|"publicacao"|"rejeicao"; titulo: string; prospeccao: string; usuario: string; data: string; hora: string; }

const events: any[] = [];


const typeMeta: Record<string, { icon: any; bg: string; fg: string; label: string }> = {
  criacao:    { icon: FileText,      bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)", label: "Criação" },
  edicao:     { icon: GitCommit,     bg: "hsl(258,90%,96%)", fg: "hsl(258,90%,45%)", label: "Edição" },
  aprovacao:  { icon: CheckCircle2,  bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", label: "Aprovação" },
  publicacao: { icon: CheckCircle2,  bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", label: "Publicação" },
  rejeicao:   { icon: AlertTriangle, bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)",   label: "Rejeição" },
};

export default function ConsultorHistorico() {
  return (
    <ConsultorPageShell
      title="Histórico" subtitle="Trilha completa de auditoria com versões, alterações e aprovações."
      kpis={[
        { label: "Eventos (30d)", value: 412, hint: "Total registrado", icon: History, tone: "blue" },
        { label: "Publicações",   value: 47,  hint: "Prospeccoes AJ concluídos",  icon: CheckCircle2, tone: "green" },
        { label: "Edições",       value: 198, hint: "Blocos alterados", icon: GitCommit,    tone: "purple" },
        { label: "Aprovações",    value: 89,  hint: "Coordenação",      icon: CheckCircle2, tone: "green" },
        { label: "Rejeições",     value: 14,  hint: "Para revisão",     icon: AlertTriangle, tone: "red" },
        { label: "Usuários Ativos", value: 6, hint: "Equipe",           icon: User,         tone: "slate" },
      ]}
    >
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-semibold mb-4">Linha do Tempo</h3>
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
                      <span className="text-xs font-mono text-primary">{e.prospeccao}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{e.data} • {e.hora}</span>
                    </div>
                    <div className="text-sm font-medium text-foreground">{e.titulo}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><User className="w-3 h-3" /> {e.usuario}</div>
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
