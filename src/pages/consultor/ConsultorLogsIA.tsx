import { Activity, Brain, Zap, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

interface Log { id: string; tipo: "info"|"success"|"warn"|"error"; agente: string; acao: string; prospeccao: string; modelo: string; tokens: number; tempo: string; data: string; }

const logs: any[] = [];


const typeMeta: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  info:    { bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)", dot: "hsl(217,91%,55%)", label: "INFO"  },
  success: { bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", dot: "hsl(142,76%,40%)", label: "OK"    },
  warn:    { bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)",  dot: "hsl(38,92%,50%)",  label: "WARN"  },
  error:   { bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,45%)",   dot: "hsl(0,84%,55%)",   label: "ERROR" },
};

export default function ConsultorLogsIA() {
  return (
    <ConsultorPageShell
      title="Logs IA" subtitle="Telemetria em tempo real dos agentes de inteligência artificial."
      kpis={[
        { label: "Eventos (24h)", value: 0, hint: "Total processado", icon: Activity, tone: "blue" },
        { label: "Sucesso",       value: "—", hint: "Taxa global",     icon: CheckCircle2, tone: "green" },
        { label: "Warnings",      value: 0,   hint: "Para revisar",     icon: AlertTriangle, tone: "orange" },
        { label: "Erros",         value: 0,   hint: "Críticos",         icon: AlertTriangle, tone: "red" },
        { label: "Tokens (24h)",  value: "—", hint: "Consumo LLM",    icon: Brain,        tone: "purple" },
        { label: "Latência Média",value: "—", hint: "Por chamada",    icon: Clock,        tone: "slate" },
      ]}
    >
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Stream de Atividade</h3>
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> AO VIVO
            </span>
          </div>
          <div className="flex items-center gap-1">
            {["TODOS","INFO","OK","WARN","ERROR"].map(f => (
              <button key={f} className="text-xs font-medium px-3 py-1.5 rounded-md text-muted-foreground hover:bg-muted">{f}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5">Tipo</th>
                <th className="text-left px-4 py-2.5">Agente</th>
                <th className="text-left px-4 py-2.5">Ação</th>
                <th className="text-left px-4 py-2.5">Prospeccao AJ</th>
                <th className="text-left px-4 py-2.5">Modelo</th>
                <th className="text-right px-4 py-2.5">Tokens</th>
                <th className="text-right px-4 py-2.5">Tempo</th>
                <th className="text-right px-4 py-2.5">Quando</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => {
                const m = typeMeta[l.tipo];
                return (
                  <tr key={l.id} className="border-t hover:bg-muted/20 font-mono text-xs">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-bold" style={{ background: m.bg, color: m.fg }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />
                        {m.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{l.agente}</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.acao}</td>
                    <td className="px-4 py-3 text-primary">{l.prospeccao}</td>
                    <td className="px-4 py-3 text-purple-700">{l.modelo}</td>
                    <td className="px-4 py-3 text-right">{l.tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{l.tempo}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{l.data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ConsultorPageShell>
  );
}
