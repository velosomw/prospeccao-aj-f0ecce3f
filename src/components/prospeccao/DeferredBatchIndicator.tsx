import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Hourglass, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface DeferredFolderStatus {
  in_batch_count: number;
  done_count: number;
  failed_count: number;
  total_count: number;
  earliest_eta: string | null;
  latest_eta: string | null;
}

interface Props {
  companyId: string;
  prospeccaoId?: string | null;
  folderPath?: string | null;
  variant?: "folder" | "prospeccao-summary";
  pollMs?: number;
}

function formatEta(target: string | null): string {
  if (!target) return "";
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return "a qualquer momento";
  const h = Math.ceil(ms / (60 * 60 * 1000));
  if (h <= 1) return "em ~1h";
  return `em até ${h}h`;
}

/**
 * Indicador de arquivos em fila batch (Document AI, até 24h, ~50% mais barato).
 * Variant 'folder': badge compacto na linha da pasta
 * Variant 'prospeccao-summary': barra agregada para topo do workspace
 */
export function DeferredBatchIndicator({ companyId, prospeccaoId, folderPath, variant = "folder", pollMs = 15000 }: Props) {
  const [status, setStatus] = useState<DeferredFolderStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      // Para prospeccao-summary: agrega todas as pastas do Prospeccao
      if (variant === "prospeccao-summary") {
        let q = supabase
          .from("folder_deferred_status" as never)
          .select("in_batch_count, done_count, failed_count, total_count, earliest_eta, latest_eta")
          .eq("company_id", companyId);
        if (prospeccaoId) q = q.eq("prospeccao_id", prospeccaoId);
        const { data } = await q;
        if (cancelled) return;
        const rows = (data ?? []) as DeferredFolderStatus[];
        if (rows.length === 0) { setStatus(null); return; }
        const agg: DeferredFolderStatus = {
          in_batch_count: rows.reduce((s, r) => s + (r.in_batch_count ?? 0), 0),
          done_count: rows.reduce((s, r) => s + (r.done_count ?? 0), 0),
          failed_count: rows.reduce((s, r) => s + (r.failed_count ?? 0), 0),
          total_count: rows.reduce((s, r) => s + (r.total_count ?? 0), 0),
          earliest_eta: rows.map(r => r.earliest_eta).filter(Boolean).sort()[0] ?? null,
          latest_eta: rows.map(r => r.latest_eta).filter(Boolean).sort().at(-1) ?? null,
        };
        setStatus(agg);
        return;
      }
      // Para folder
      if (!folderPath) return;
      let q = supabase
        .from("folder_deferred_status" as never)
        .select("*")
        .eq("company_id", companyId)
        .eq("folder_path", folderPath);
      if (prospeccaoId) q = q.eq("prospeccao_id", prospeccaoId);
      const { data } = await q.maybeSingle();
      if (!cancelled) setStatus((data as DeferredFolderStatus | null) ?? null);
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, pollMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [companyId, prospeccaoId, folderPath, pollMs, variant]);

  if (!status || status.total_count === 0) return null;
  if (status.in_batch_count === 0 && status.done_count === 0) return null;

  if (variant === "prospeccao-summary") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
        <Hourglass className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">Processamento batch econômico</span>
        {status.in_batch_count > 0 && (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            {status.in_batch_count} arquivo(s) {formatEta(status.latest_eta)}
          </Badge>
        )}
        {status.done_count > 0 && (
          <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
            <CheckCircle2 className="h-3 w-3" /> {status.done_count} concluído(s)
          </Badge>
        )}
        {status.failed_count > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> {status.failed_count}
          </Badge>
        )}
      </div>
    );
  }

  // Folder
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary">
            <Hourglass className="h-3 w-3" />
            {status.in_batch_count} batch · {formatEta(status.latest_eta)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <div>Arquivos grandes processados em lote (motor econômico).</div>
            <div className="text-muted-foreground">~50% mais barato que processamento síncrono</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Badge para um arquivo individual quando ele está em fila deferred.
 */
export function DeferredFileBadge({ fileId }: { fileId: string }) {
  const [job, setJob] = useState<{ status: string; eta_at: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchJob = async () => {
      const { data } = await supabase
        .from("deferred_jobs" as never)
        .select("status, eta_at")
        .eq("file_id", fileId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setJob(data as never);
    };
    fetchJob();
    const i = setInterval(fetchJob, 30000);
    return () => { cancelled = true; clearInterval(i); };
  }, [fileId]);

  if (!job || ["done", "cancelled"].includes(job.status)) return null;
  if (job.status === "failed") {
    return <Badge variant="destructive" className="gap-1 text-[10px]"><AlertCircle className="h-2.5 w-2.5" />batch falhou</Badge>;
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary text-[10px]">
            <Hourglass className="h-2.5 w-2.5" />
            Batch · {formatEta(job.eta_at)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">Arquivo grande — processamento econômico em lote ({formatEta(job.eta_at)})</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
