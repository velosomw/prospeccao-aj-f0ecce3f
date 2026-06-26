// Painel de validação automática do pipeline ai-full-process
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, XCircle, Loader2, PlayCircle, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  runPipelineDiagnostic,
  type DiagnosticStep,
  type DiagnosticResult,
} from "@/services/pipelineDiagnosticService";

interface Props {
  onComplete?: (r: DiagnosticResult) => void;
}

export default function PipelineDiagnosticPanel({ onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<DiagnosticStep[]>([]);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  const run = async () => {
    setRunning(true);
    setSteps([]);
    setResult(null);
    try {
      const r = await runPipelineDiagnostic(setSteps);
      setResult(r);
      onComplete?.(r);
      toast.success("Pipeline validado com sucesso", {
        description: `Quality score: ${(r.quality_score ?? 0).toFixed(2)} · runs ${r.before.total_runs}→${r.after.total_runs}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Diagnóstico falhou", { description: msg });
    } finally {
      setRunning(false);
    }
  };

  const Icon = ({ s }: { s: DiagnosticStep["status"] }) => {
    if (s === "running") return <Loader2 className="w-4 h-4 animate-spin text-[hsl(217,91%,50%)]" />;
    if (s === "ok") return <CheckCircle2 className="w-4 h-4 text-[hsl(152,70%,45%)]" />;
    if (s === "fail") return <XCircle className="w-4 h-4 text-[hsl(0,80%,55%)]" />;
    return <span className="w-4 h-4 rounded-full border border-border bg-muted" />;
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-[hsl(217,91%,50%)]/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-[hsl(217,91%,50%)]" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">Diagnóstico do Pipeline IA</h3>
            <p className="text-xs text-muted-foreground">
              Executa um upload sintético end-to-end e valida atualização dos KPIs e gráfico de acurácia.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={run} disabled={running} size="sm" className="gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            {running ? "Executando…" : "Executar diagnóstico"}
          </Button>
          {(steps.length > 0 || result) && !running && (
            <Button
              onClick={() => { setSteps([]); setResult(null); }}
              size="sm"
              variant="outline"
              className="gap-1"
              title="Recolher e limpar diagnóstico"
            >
              <ChevronUp className="w-4 h-4" />
              Recolher
            </Button>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <div className="mt-0.5"><Icon s={s.status} /></div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{s.name}</span>
                  {s.duration_ms != null && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{s.duration_ms}ms</span>
                  )}
                </div>
                {s.detail && (
                  <p className={`text-xs mt-0.5 ${s.status === "fail" ? "text-[hsl(0,80%,55%)]" : "text-muted-foreground"}`}>
                    {s.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {result?.success && (
        <div className="mt-4 p-3 rounded-lg bg-[hsl(152,70%,45%)]/10 border border-[hsl(152,70%,45%)]/30 text-xs">
          <p className="font-semibold text-[hsl(152,70%,35%)] mb-1">✓ Pipeline operacional</p>
          <p className="text-muted-foreground">
            Extração <code className="bg-background px-1 rounded">{result.extraction_id?.slice(0, 8)}…</code> persistida.
            KPIs e gráfico de acurácia recarregam automaticamente na Visão Geral.
          </p>
        </div>
      )}
    </div>
  );
}
