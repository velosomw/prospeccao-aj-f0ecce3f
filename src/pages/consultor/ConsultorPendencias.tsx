import { useMemo, useState } from "react";
import { AlertTriangle, AlertCircle, Clock, CheckCircle2, Building2, ArrowRight } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { mockProspeccoes } from "@/data/prospeccoesMockData";

type Sev = "critica" | "alta" | "media" | "baixa";
const sevMeta: Record<Sev, { label: string; bg: string; fg: string; ring: string }> = {
  critica: { label: "Crítica", bg: "hsl(0,84%,95%)",  fg: "hsl(0,84%,45%)",  ring: "hsl(0,84%,60%)" },
  alta:    { label: "Alta",    bg: "hsl(38,92%,95%)", fg: "hsl(38,92%,40%)", ring: "hsl(38,92%,50%)" },
  media:   { label: "Média",   bg: "hsl(48,96%,93%)", fg: "hsl(48,96%,38%)", ring: "hsl(48,96%,53%)" },
  baixa:   { label: "Baixa",   bg: "hsl(220,15%,93%)",fg: "hsl(220,15%,40%)",ring: "hsl(220,15%,55%)" },
};

interface Pend { id: string; titulo: string; prospeccao: string; empresa: string; severidade: Sev; sla: string; topic: string; }

const pendMock: any[] = [];


export default function ConsultorPendencias() {
  const [filter, setFilter] = useState<Sev | "todas">("todas");
  const counts = useMemo(() => ({
    critica: pendMock.filter(p => p.severidade === "critica").length,
    alta:    pendMock.filter(p => p.severidade === "alta").length,
    media:   pendMock.filter(p => p.severidade === "media").length,
    baixa:   pendMock.filter(p => p.severidade === "baixa").length,
  }), []);
  const rows = filter === "todas" ? pendMock : pendMock.filter(p => p.severidade === filter);

  return (
    <ConsultorPageShell
      title="Pendências" subtitle="Triagem cognitiva por severidade, SLA e impacto."
      kpis={[
        { label: "Total Aberto", value: pendMock.length, hint: "Em aberto",  icon: AlertTriangle, tone: "orange" },
        { label: "Críticas",     value: counts.critica,  hint: "SLA < 24h",  icon: AlertCircle,    tone: "red" },
        { label: "Altas",        value: counts.alta,     hint: "SLA < 48h",  icon: AlertTriangle,  tone: "orange" },
        { label: "Médias",       value: counts.media,    hint: "SLA < 5d",   icon: Clock,          tone: "purple" },
        { label: "Resolvidas Hoje", value: 0,           hint: "+3 vs ontem",icon: CheckCircle2,   tone: "green" },
        { label: "SLA Médio",    value: "—",          hint: "Tempo resp.",icon: Clock,          tone: "blue" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold">Fila Priorizada de Pendências</h3>
          <div className="flex items-center gap-1">
            {(["todas","critica","alta","media","baixa"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md ${
                  filter === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                }`}>{f === "todas" ? "Todas" : sevMeta[f].label}</button>
            ))}
          </div>
        </div>
        <div className="divide-y">
          {rows.map(p => {
            const m = sevMeta[p.severidade];
            return (
              <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-muted/20 transition">
                <div className="w-1 h-12 rounded-full" style={{ background: m.ring }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{p.id}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                    <span className="text-xs text-red-600 font-medium">{p.sla}</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground truncate">{p.titulo}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{p.empresa}</span>
                    <span>•</span><span className="text-primary font-mono">{p.prospeccao}</span>
                    <span>•</span><span>{p.topic}</span>
                  </div>
                </div>
                <button className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  Resolver <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ConsultorPageShell>
  );
}
