import { History, GitCommit, User, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const events = [
  { id: "AH-401", tipo: "publicacao", titulo: "Prospeccao Mai/2026 publicado - DIPLOMATA", empresa: "DIPLOMATA", autor: "Adm. Judicial", data: "Hoje 14:32" },
  { id: "AH-400", tipo: "edicao",     titulo: "Pendência cobrada - TECNOMAX",       empresa: "TECNOMAX",  autor: "Adm. Judicial", data: "Hoje 13:10" },
  { id: "AH-399", tipo: "rejeicao",   titulo: "Documento reprovado - MOVAG",        empresa: "MOVAG",     autor: "Adm. Judicial", data: "Ontem" },
  { id: "AH-398", tipo: "aprovacao",  titulo: "Plano de pagamento aprovado",        empresa: "BENTOIA",   autor: "Adm. Judicial", data: "07/05" },
  { id: "AH-397", tipo: "criacao",    titulo: "Nova recuperanda cadastrada",        empresa: "AGRIBEN",   autor: "Adm. Judicial", data: "06/05" },
];
const typeMeta: Record<string, { icon: any; bg: string; fg: string; label: string }> = {
  criacao:    { icon: FileText,      bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)", label: "Criação" },
  edicao:     { icon: GitCommit,     bg: "hsl(258,90%,96%)", fg: "hsl(258,90%,45%)", label: "Cobrança" },
  aprovacao:  { icon: CheckCircle2,  bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", label: "Aprovação" },
  publicacao: { icon: CheckCircle2,  bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", label: "Publicação" },
  rejeicao:   { icon: AlertTriangle, bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)",   label: "Rejeição" },
};

export default function AdmHistorico() {
  return (
    <ConsultorPageShell
      title="Histórico" subtitle="Trilha das ações administrativas e cobranças."
      kpis={[
        { label: "Eventos (30d)", value: 184, hint: "Total",     icon: History,      tone: "blue" },
        { label: "Publicações",   value: 47,  hint: "Prospeccoes AJ",      icon: CheckCircle2, tone: "green" },
        { label: "Cobranças",     value: 88,  hint: "Pendências",icon: GitCommit,    tone: "purple" },
        { label: "Aprovações",    value: 41,  hint: "Documentos",icon: CheckCircle2, tone: "green" },
        { label: "Rejeições",     value: 8,   hint: "Para refazer",icon: AlertTriangle, tone: "red" },
        { label: "Empresas",      value: 16,  hint: "Cobertura", icon: User,         tone: "slate" },
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
                      <span className="text-xs font-semibold text-foreground">{e.empresa}</span>
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
