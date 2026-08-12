import { Activity, Cpu, CheckCircle2, AlertTriangle, Clock, Zap } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { mockProspeccoes } from "@/data/prospeccoesMockData";

const stages = [
  { key: "ingestao",   label: "Ingestão",         color: "hsl(217,91%,50%)" },
  { key: "ocr",        label: "OCR Vision",       color: "hsl(258,90%,55%)" },
  { key: "ia",         label: "Análise IA",       color: "hsl(280,80%,55%)" },
  { key: "consolida",  label: "Consolidação",     color: "hsl(38,92%,50%)"  },
  { key: "validacao",  label: "Validação",        color: "hsl(142,76%,40%)" },
];

export default function ConsultorProcessos() {
  const running = mockProspeccoes.filter(r => r.status === "em_processamento");

  return (
    <ConsultorPageShell
      title="Processos" subtitle="Pipelines de IA, OCR e validação em execução em tempo real."
      kpis={[
        { label: "Em Execução",   value: running.length,  hint: "Pipelines ativos", icon: Activity,    tone: "purple" },
        { label: "Concluídos Hoje", value: 0,            hint: "Últimas 24h",      icon: CheckCircle2, tone: "green" },
        { label: "Falhas",        value: 0,               hint: "Requer atenção",   icon: AlertTriangle, tone: "red" },
        { label: "Tempo Médio",   value: "—",        hint: "Por documento",    icon: Clock,        tone: "blue" },
        { label: "Taxa Sucesso",  value: "—",           hint: "Últimos 7d",       icon: Zap,          tone: "green" },
        { label: "GPU Workers",   value: "—",           hint: "Capacidade",       icon: Cpu,          tone: "orange" },
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold mb-4">Pipelines em Execução</h3>
          <div className="space-y-4">
            {running.slice(0, 6).map(r => {
              const cur = Math.floor((r.percentual / 100) * stages.length);
              return (
                <div key={r.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-primary">{r.id}</div>
                      <div className="text-xs text-muted-foreground">{r.empresa}</div>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-purple-50 text-purple-700">{r.percentual}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {stages.map((s, i) => (
                      <div key={s.key} className="flex-1">
                        <div className="h-1.5 rounded-full" style={{ background: i <= cur ? s.color : "hsl(220,15%,90%)" }} />
                        <div className="text-[10px] text-muted-foreground mt-1 truncate">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {running.length === 0 && <div className="text-sm text-muted-foreground text-center py-10">Nenhum pipeline em execução.</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold mb-4">Capacidade do Cluster</h3>
          <div className="space-y-4">
            {[
              { label: "CPU", v: 62, c: "hsl(217,91%,50%)" },
              { label: "GPU", v: 78, c: "hsl(258,90%,55%)" },
              { label: "Memória", v: 45, c: "hsl(142,76%,40%)" },
              { label: "Fila de Jobs", v: 23, c: "hsl(38,92%,50%)" },
            ].map(m => (
              <div key={m.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{m.label}</span>
                  <span className="font-bold" style={{ color: m.c }}>{m.v}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${m.v}%`, background: m.c }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ConsultorPageShell>
  );
}
