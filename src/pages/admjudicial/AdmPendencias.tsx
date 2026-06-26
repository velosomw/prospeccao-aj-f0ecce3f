import { AlertTriangle, AlertCircle, Clock, CheckCircle2, ArrowRight, Building2 } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

const pend = [
  { item: "Balancete Mai - DIPLOMATA",   empresa: "DIPLOMATA",  sev: "critica", sla: "Vence em 2h" },
  { item: "DRE Abr - TECNOMAX",          empresa: "TECNOMAX",   sev: "critica", sla: "Vence hoje" },
  { item: "Folha Abril - BENTOIA",       empresa: "BENTOIA",    sev: "alta",    sla: "Vence em 1d" },
  { item: "Notas fiscais - MOVAG",       empresa: "MOVAG",      sev: "alta",    sla: "Vence em 1d" },
  { item: "Inventário - AGRIBEN",        empresa: "AGRIBEN",    sev: "media",   sla: "Vence em 4d" },
];
const sevMeta: Record<string, { label: string; bg: string; fg: string; ring: string }> = {
  critica: { label: "Crítica", bg: "hsl(0,84%,95%)",  fg: "hsl(0,84%,45%)",  ring: "hsl(0,84%,60%)" },
  alta:    { label: "Alta",    bg: "hsl(38,92%,95%)", fg: "hsl(38,92%,40%)", ring: "hsl(38,92%,50%)" },
  media:   { label: "Média",   bg: "hsl(48,96%,93%)", fg: "hsl(48,96%,38%)", ring: "hsl(48,96%,53%)" },
};

export default function AdmPendencias() {
  return (
    <ConsultorPageShell
      title="Pendências" subtitle="Documentos solicitados às recuperandas administradas."
      kpis={[
        { label: "Total Aberto",   value: 23, hint: "Em aberto",   icon: AlertTriangle, tone: "orange" },
        { label: "Críticas",       value: 6,  hint: "SLA < 24h",   icon: AlertCircle,    tone: "red" },
        { label: "Altas",          value: 9,  hint: "SLA < 48h",   icon: AlertTriangle,  tone: "orange" },
        { label: "Médias",         value: 8,  hint: "SLA < 5d",    icon: Clock,          tone: "purple" },
        { label: "Resolvidas (30d)",value: 41,hint: "Concluídas",  icon: CheckCircle2,   tone: "green" },
        { label: "SLA Médio",      value: "1.9d", hint: "Resposta",icon: Clock,          tone: "blue" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b"><h3 className="text-sm font-semibold">Fila de Pendências</h3></div>
        <div className="divide-y">
          {pend.map(p => {
            const m = sevMeta[p.sev];
            return (
              <div key={p.item} className="flex items-center gap-4 p-4 hover:bg-muted/20">
                <div className="w-1 h-12 rounded-full" style={{ background: m.ring }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                    <span className="text-xs text-red-600 font-medium">{p.sla}</span>
                  </div>
                  <div className="text-sm font-semibold">{p.item}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Building2 className="w-3 h-3" />{p.empresa}</div>
                </div>
                <button className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Cobrar <ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            );
          })}
        </div>
      </div>
    </ConsultorPageShell>
  );
}
