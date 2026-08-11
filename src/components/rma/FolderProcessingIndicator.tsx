import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Clock, AlertCircle, Hourglass } from "lucide-react";

interface FolderStatus {
  done_count: number;
  processing_count: number;
  rate_limited_count: number;
  pending_count: number;
  failed_count: number;
  chunk_count: number;
  total_count: number;
  rate_limit_until: string | null;
}

interface Props {
  companyId: string;
  prospecçãoId?: string | null;
  folderPath: string;
  pollMs?: number;
}

function formatCountdown(target: string | null): string {
  if (!target) return "";
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return "liberando…";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

export function FolderProcessingIndicator({ companyId, prospecçãoId, folderPath, pollMs = 15000 }: Props) {
  const [status, setStatus] = useState<FolderStatus | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      let q = supabase
        .from("folder_processing_status" as never)
        .select("*")
        .eq("company_id", companyId)
        .eq("folder_path", folderPath);
      if (prospecçãoId) q = q.eq("prospecção_id", prospecçãoId);
      const { data } = await q.maybeSingle();
      if (!cancelled) setStatus((data as FolderStatus | null) ?? null);
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, pollMs);
    const ticker = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(ticker);
    };
  }, [companyId, prospecçãoId, folderPath, pollMs]);

  if (!status || status.total_count === 0) return null;

  const allDone = status.done_count === status.total_count;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-tick={tick}>
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="h-3 w-3 text-green-600" />
        {status.done_count}/{status.total_count} OCR
      </Badge>

      {status.processing_count > 0 && (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {status.processing_count} processando
        </Badge>
      )}

      {status.rate_limited_count > 0 && (
        <Badge variant="outline" className="gap-1 border-orange-300 text-orange-700">
          <Hourglass className="h-3 w-3" />
          {status.rate_limited_count} aguardando rate-limit ({formatCountdown(status.rate_limit_until)})
        </Badge>
      )}

      {status.pending_count > 0 && (
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          {status.pending_count} na fila
        </Badge>
      )}

      {status.chunk_count > 0 && (
        <Badge variant="outline" className="gap-1">
          {status.chunk_count} chunks
        </Badge>
      )}

      {status.failed_count > 0 && (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          {status.failed_count} falhou
        </Badge>
      )}

      {allDone && (
        <Badge className="bg-green-600 hover:bg-green-700">Concluído</Badge>
      )}
    </div>
  );
}
