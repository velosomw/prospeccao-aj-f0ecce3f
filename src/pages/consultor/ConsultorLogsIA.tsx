import { Activity, Brain, Zap, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";

interface Log { id: string; tipo: "info"|"success"|"warn"|"error"; agente: string; acao: string; prospeccao: string; modelo: string; tokens: number; tempo: string; data: string; }

const logs: Log[] = [
  { id: "L-9001", tipo: "success", agente: "Auditor Contábil Sênior IA", acao: "Análise Balancete concluída", prospeccao: "Prospeccao-0012", modelo: "gemini-2.5-pro", tokens: 4820, tempo: "12.4s", data: "Há 2m" },
  { id: "L-9000", tipo: "info",    agente: "Router IA",                  acao: "Roteamento OCR → Vision",     prospeccao: "Prospeccao-0014", modelo: "gemini-2.5-flash", tokens: 320, tempo: "0.8s", data: "Há 3m" },
  { id: "L-8999", tipo: "warn",    agente: "Validador IA",               acao: "Score abaixo do threshold (62)", prospeccao: "Prospeccao-0009", modelo: "gemini-2.5-pro", tokens: 1240, tempo: "4.1s", data: "Há 5m" },
  { id: "L-8998", tipo: "success", agente: "Auditor Contábil Sênior IA", acao: "DRE consolidada",             prospeccao: "Prospeccao-0011", modelo: "gpt-5",          tokens: 6320, tempo: "18.2s", data: "Há 8m" },
  { id: "L-8997", tipo: "error",   agente: "OCR Vision",                 acao: "Falha ao processar PDF (timeout)", prospeccao: "Prospeccao-0010", modelo: "vision-doc",  tokens: 0, tempo: "30s", data: "Há 12m" },
  { id: "L-8996", tipo: "success", agente: "GPT OSS Finance",            acao: "Cálculo Kanitz FI = 2.4",     prospeccao: "Prospeccao-0012", modelo: "gpt-oss",        tokens: 980, tempo: "3.0s", data: "Há 18m" },
  { id: "L-8995", tipo: "info",    agente: "Cache Semântico",            acao: "Hit no cache LLM (-4200 tk)", prospeccao: "Prospeccao-0014", modelo: "—",              tokens: 0,    tempo: "0.05s", data: "Há 22m" },
];

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
        { label: "Eventos (24h)", value: 1842, hint: "Total processado", icon: Activity, tone: "blue" },
        { label: "Sucesso",       value: "97%", hint: "Taxa global",     icon: CheckCircle2, tone: "green" },
        { label: "Warnings",      value: 41,   hint: "Para revisar",     icon: AlertTriangle, tone: "orange" },
        { label: "Erros",         value: 12,   hint: "Críticos",         icon: AlertTriangle, tone: "red" },
        { label: "Tokens (24h)",  value: "412k", hint: "Consumo LLM",    icon: Brain,        tone: "purple" },
        { label: "Latência Média",value: "8.2s", hint: "Por chamada",    icon: Clock,        tone: "slate" },
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
                <th className="text-left px-4 py-2.5">Prospecção AJ</th>
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
