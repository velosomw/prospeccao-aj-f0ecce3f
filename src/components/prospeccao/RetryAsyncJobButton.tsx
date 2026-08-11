import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  retryProcessing,
  waitForProcessing,
  type AiStatus,
  type AiProcessStatus,
} from "@/services/aiProcessService";

interface Props {
  /** ID do job anterior canceled/failed */
  jobId: string;
  /** Status atual do job (botão só renderiza se canceled/failed) */
  status: AiStatus;
  /** Quantos chunks já foram processados — apenas para exibição */
  chunksProcessed?: number | null;
  chunksTotal?: number | null;
  /** Callback chamado quando o novo job termina (sucesso ou falha) */
  onCompleted?: (finalStatus: AiProcessStatus) => void;
  /** Callback chamado a cada atualização de progresso do novo job */
  onProgress?: (s: AiProcessStatus) => void;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
}

/**
 * Botão para reprocessar um job assíncrono canceled/failed.
 * Cria um novo job reaproveitando partial_results via `resume_from_id`.
 */
export function RetryAsyncJobButton({
  jobId,
  status,
  chunksProcessed,
  chunksTotal,
  onCompleted,
  onProgress,
  size = "sm",
  variant = "outline",
}: Props) {
  const [loading, setLoading] = useState(false);

  if (status !== "canceled" && status !== "failed") return null;

  const reusable =
    typeof chunksProcessed === "number" && chunksProcessed > 0
      ? `${chunksProcessed}/${chunksTotal ?? "?"} chunk(s) já processados serão reaproveitados`
      : "Reiniciar do zero";

  const handleRetry = async () => {
    setLoading(true);
    try {
      const started = await retryProcessing(jobId);
      toast({
        title: "Retentativa iniciada",
        description: `Novo job ${started.id.slice(0, 8)}… — ${reusable}.`,
      });

      // Polling em background; UI continua responsiva
      waitForProcessing(started.id, onProgress)
        .then((final) => {
          onCompleted?.(final);
          if (final.status === "completed") {
            toast({
              title: "Processamento concluído",
              description: `Job ${started.id.slice(0, 8)}… finalizado com sucesso.`,
            });
          } else {
            toast({
              title: "Falha no reprocessamento",
              description: final.error_message || `Status final: ${final.status}`,
              variant: "destructive",
            });
          }
        })
        .catch((err) => {
          toast({
            title: "Erro durante polling",
            description: err instanceof Error ? err.message : String(err),
            variant: "destructive",
          });
        });
    } catch (err) {
      toast({
        title: "Falha ao iniciar retentativa",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleRetry}
      disabled={loading}
      title={reusable}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      <span className="ml-2">Reprocessar</span>
    </Button>
  );
}
