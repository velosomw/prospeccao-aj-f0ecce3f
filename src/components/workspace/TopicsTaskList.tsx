import { useState } from "react";
import { Star, AlertOctagon, Clock, CheckCircle2, FileText, Gauge, ArrowRight, User as UserIcon, ChevronDown, ChevronRight } from "lucide-react";
import TopicFilesPanel from "@/components/workspace/TopicFilesPanel";


export type TopicSeverity = "critico" | "alto" | "medio" | "baixo";
export type TopicStatus = "completo" | "incompleto" | "pendente" | "em_processamento";

export interface TopicItem {
  id: string;
  number: number;
  title: string;
  subtitle?: string;
  severity: TopicSeverity;
  status: TopicStatus;
  origin: "Sistema" | "Cliente" | "IA";
  impact: "Alto" | "Médio" | "Baixo";
}

interface Props {
  items: TopicItem[];
  onOpen?: (id: string) => void;
  prospecçãoId?: string | null;
}


const sevColor: Record<TopicSeverity, string> = {
  critico: "hsl(0,84%,60%)",
  alto: "hsl(0,84%,60%)",
  medio: "hsl(38,92%,50%)",
  baixo: "hsl(142,76%,36%)",
};

const statusBadge: Record<TopicStatus, { label: string; bg: string; text: string }> = {
  completo: { label: "Completo", bg: "hsl(142,76%,36%)/15", text: "hsl(142,76%,30%)" },
  incompleto: { label: "Incompleto", bg: "hsl(0,84%,60%)/15", text: "hsl(0,84%,45%)" },
  pendente: { label: "Pendente", bg: "hsl(38,92%,50%)/15", text: "hsl(38,92%,40%)" },
  em_processamento: { label: "Em processamento", bg: "hsl(258,90%,56%)/15", text: "hsl(258,90%,40%)" },
};

export default function TopicTaskCard({
  item,
  onOpen,
  prospecçãoId,
}: {
  item: TopicItem;
  onOpen?: (id: string) => void;
  prospecçãoId?: string | null;
}) {
  const sev = sevColor[item.severity];
  const sb = statusBadge[item.status];
  const Icon = item.status === "completo" ? CheckCircle2 :
               item.severity === "critico" ? AlertOctagon :
               item.status === "pendente" ? Clock : Star;
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  const toggle = () => {
    setOpen((v) => !v);
    onOpen?.(item.id);
  };
  return (
    <div className="bg-white border border-border rounded-lg hover:border-[hsl(217,91%,50%)]/30 transition-colors overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        className="grid grid-cols-12 gap-3 items-center px-4 py-3 cursor-pointer"
      >
        <div className="col-span-12 md:col-span-5 flex items-start gap-2">
          <Chevron className="w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
          <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: sev }} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{item.title}</div>
            {item.subtitle && <div className="text-[11px] text-muted-foreground truncate">{item.subtitle}</div>}
          </div>
        </div>
        <div className="col-span-4 md:col-span-2 flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5" style={{ color: sev }} />
          <div className="leading-tight">
            <div className="text-xs font-bold" style={{ color: sev }}>{item.impact}</div>
            <div className="text-[10px] text-muted-foreground">Impacto</div>
          </div>
        </div>
        <div className="col-span-4 md:col-span-2">
          <span
            className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold"
            style={{ background: `color-mix(in srgb, ${sev} 15%, white)`, color: sev }}
          >
            {item.severity === "critico" ? "Crítico" : item.severity === "alto" ? "Alto" : item.severity === "medio" ? "Médio" : "Baixo"}
          </span>
        </div>
        <div className="col-span-4 md:col-span-1 flex items-center gap-1 text-[11px] text-muted-foreground">
          {item.origin === "Cliente" ? <UserIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
          {item.origin}
        </div>
        <div className="col-span-6 md:col-span-1">
          <span
            className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold"
            style={{ background: `color-mix(in srgb, ${sb.text} 15%, white)`, color: sb.text }}
          >
            {sb.label}
          </span>
        </div>
        <div className="col-span-6 md:col-span-1 flex justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            className="text-[11px] font-semibold text-[hsl(217,91%,50%)] border border-[hsl(217,91%,50%)]/40 hover:bg-[hsl(217,91%,50%)]/5 rounded-md px-2 py-1 flex items-center gap-1"
          >
            {open ? "Ocultar" : "Ver"} <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      {open && (
        <TopicFilesPanel prospecçãoId={prospecçãoId ?? null} topicNumber={Number(item.number) || 0} />
      )}
    </div>
  );
}

export function TopicsTaskList({ items, onOpen, prospecçãoId }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-white border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Nenhum tópico para este filtro.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((it) => <TopicTaskCard key={it.id} item={it} onOpen={onOpen} prospecçãoId={prospecçãoId} />)}
    </div>
  );
}

