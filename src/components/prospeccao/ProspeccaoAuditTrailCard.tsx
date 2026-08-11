import { useEffect, useState, useMemo } from "react";
import { Loader2, RefreshCw, ShieldAlert, AlertTriangle, Upload, CheckCircle2, Clock, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  prospeccaoId?: string | null;
  companyId?: string | null;
}

interface FileRow {
  file_id: string;
  file_name: string;
  path: string;
  status: string;
  parse_attempts: number;
  learning_attempts: number;
  requires_manual_upload: boolean;
  error_message: string | null;
  last_learning_error: string | null;
  last_parse_error_at: string | null;
  last_learning_at: string | null;
  last_processed_at: string | null;
  updated_at: string;
}

interface QueueRow {
  file_id: string;
  status: string;
  attempts: number;
  block_reason: string | null;
  error_message: string | null;
  updated_at: string;
}

interface FailedJobRow {
  file_id: string;
  reason: string | null;
  attempts: number;
  error_message: string | null;
  created_at: string;
  resolved_at: string | null;
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }
  catch { return ts; }
}

function statusBadge(row: FileRow) {
  if (row.requires_manual_upload || row.status === "manual_upload_required")
    return <Badge className="bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-0 text-[10px]">Upload manual exigido</Badge>;
  if (row.status === "processed")
    return <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-0 text-[10px]">Processado</Badge>;
  if (row.status === "error")
    return <Badge className="bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-0 text-[10px]">Erro (1ª tentativa)</Badge>;
  if (row.status === "processing")
    return <Badge className="bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)] border-0 text-[10px]">Processando</Badge>;
  return <Badge className="bg-muted text-muted-foreground border-0 text-[10px]">{row.status}</Badge>;
}

export default function ProspeccaoAuditTrailCard({ prospeccaoId, companyId }: Props) {
  const [resolvedRmaId, setResolvedRmaId] = useState<string | null>(prospeccaoId ?? null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [failed, setFailed] = useState<FailedJobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(true);

  useEffect(() => {
    if (resolvedRmaId || !companyId) return;
    supabase.from("companies").select("prospeccao_id").eq("id", companyId).maybeSingle()
      .then(({ data }) => { if (data?.prospeccao_id) setResolvedRmaId(data.prospeccao_id); });
  }, [companyId, resolvedRmaId]);

  const load = async () => {
    if (!resolvedRmaId && !companyId) return;
    setLoading(true);
    try {
      let q = supabase
        .from("onedrive_files")
        .select("file_id,file_name,path,status,parse_attempts,learning_attempts,requires_manual_upload,error_message,last_learning_error,last_parse_error_at,last_learning_at,last_processed_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (resolvedRmaId) q = q.eq("prospeccao_id", resolvedRmaId);
      else if (companyId) q = q.eq("company_id", companyId);

      const { data: filesData, error: filesErr } = await q;
      if (filesErr) throw filesErr;
      const fileRows = (filesData as FileRow[]) ?? [];
      setFiles(fileRows);

      const fileIds = fileRows.map((f) => f.file_id);
      if (fileIds.length === 0) { setQueue([]); setFailed([]); return; }

      const [{ data: qData }, { data: fData }] = await Promise.all([
        supabase
          .from("processing_queue")
          .select("file_id,status,attempts,block_reason,error_message,updated_at")
          .in("file_id", fileIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("failed_jobs")
          .select("file_id,reason,attempts,error_message,created_at,resolved_at")
          .in("file_id", fileIds)
          .order("created_at", { ascending: false }),
      ]);
      setQueue((qData as QueueRow[]) ?? []);
      setFailed((fData as FailedJobRow[]) ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar trilha de auditoria");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [resolvedRmaId, companyId]);

  const queueByFile = useMemo(() => {
    const m = new Map<string, QueueRow[]>();
    queue.forEach((q) => { (m.get(q.file_id) ?? m.set(q.file_id, []).get(q.file_id)!).push(q); });
    return m;
  }, [queue]);

  const failedByFile = useMemo(() => {
    const m = new Map<string, FailedJobRow[]>();
    failed.forEach((f) => { (m.get(f.file_id) ?? m.set(f.file_id, []).get(f.file_id)!).push(f); });
    return m;
  }, [failed]);

  const filtered = useMemo(() => {
    return files.filter((f) => {
      const totalAttempts = (f.parse_attempts ?? 0) + (f.learning_attempts ?? 0)
        + (queueByFile.get(f.file_id)?.[0]?.attempts ?? 0)
        + (failedByFile.get(f.file_id)?.length ?? 0);
      if (onlyErrors && totalAttempts === 0 && !f.requires_manual_upload && f.status !== "error") return false;
      if (!filter) return true;
      const t = filter.toLowerCase();
      return f.file_name.toLowerCase().includes(t) || (f.path ?? "").toLowerCase().includes(t);
    });
  }, [files, filter, onlyErrors, queueByFile, failedByFile]);

  const totals = useMemo(() => {
    const manual = files.filter((f) => f.requires_manual_upload).length;
    const errored = files.filter((f) => f.status === "error" || (f.parse_attempts ?? 0) > 0).length;
    const totalAttempts = files.reduce((acc, f) => acc + (f.parse_attempts ?? 0) + (f.learning_attempts ?? 0), 0);
    return { manual, errored, totalAttempts, totalFiles: files.length };
  }, [files]);

  return (
    <Card className="border-2 border-[hsl(217,91%,50%)]/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[hsl(217,91%,50%)]" />
              Trilha de Auditoria — Falhas e Tentativas por Arquivo
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Histórico completo de tentativas de parse, reprocessamentos da fila, falhas arquivadas e o momento exato
              em que cada arquivo foi movido para <strong>"Upload manual exigido"</strong>.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge className="bg-muted text-foreground border-0 text-[11px] gap-1">
            <FileText className="w-3 h-3" /> {totals.totalFiles} arquivos
          </Badge>
          <Badge className="bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-0 text-[11px] gap-1">
            <AlertTriangle className="w-3 h-3" /> {totals.errored} com falha
          </Badge>
          <Badge className="bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-0 text-[11px] gap-1">
            <Upload className="w-3 h-3" /> {totals.manual} em upload manual
          </Badge>
          <Badge className="bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)] border-0 text-[11px] gap-1">
            <Clock className="w-3 h-3" /> {totals.totalAttempts} tentativas registradas
          </Badge>
        </div>
        <div className="flex gap-2 mt-3 items-center">
          <Input
            placeholder="Filtrar por nome ou pasta…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 text-xs max-w-xs"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={onlyErrors}
              onChange={(e) => setOnlyErrors(e.target.checked)}
              className="h-3 w-3"
            />
            Mostrar apenas arquivos com falha/tentativa
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando trilha…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700 py-8 justify-center">
            <CheckCircle2 className="w-4 h-4" /> Nenhum arquivo com falha registrada.
          </div>
        ) : (
          <ScrollArea className="h-[520px] rounded-md border border-border/40">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background z-10 border-b border-border/40">
                <tr>
                  <th className="text-left p-2 font-semibold text-muted-foreground">Arquivo</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground w-28">Status</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground w-16">Parse</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground w-16">Fila</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground w-16">Failed</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground w-16">Apz.</th>
                  <th className="text-left p-2 font-semibold text-muted-foreground w-40">Manual desde</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const qs = queueByFile.get(f.file_id) ?? [];
                  const fjs = failedByFile.get(f.file_id) ?? [];
                  const folder = (f.path ?? "").split("/").slice(-2, -1)[0] ?? "";
                  const lastErr = f.error_message || f.last_learning_error || qs[0]?.error_message || fjs[0]?.error_message;
                  const manualSince = f.requires_manual_upload
                    ? (fjs.find((j) => j.reason === "manual_upload_required")?.created_at ?? f.updated_at)
                    : null;

                  return (
                    <tr key={f.file_id} className="border-b border-border/10 hover:bg-muted/20 align-top">
                      <td className="p-2">
                        <p className="font-medium leading-tight break-all">{f.file_name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{folder}</p>
                        {lastErr && (
                          <p className="text-[10px] text-[hsl(0,84%,60%)] mt-1 leading-tight flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" />
                            <span className="line-clamp-2">{lastErr}</span>
                          </p>
                        )}
                        {(f.last_parse_error_at || f.last_learning_at) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Última falha de parse: {fmt(f.last_parse_error_at)} · Aprendizado: {fmt(f.last_learning_at)}
                          </p>
                        )}
                      </td>
                      <td className="p-2 text-center">{statusBadge(f)}</td>
                      <td className="p-2 text-center">
                        <Badge className={`text-[10px] border-0 ${f.parse_attempts > 0 ? "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]" : "bg-muted text-muted-foreground"}`}>
                          {f.parse_attempts ?? 0}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge className={`text-[10px] border-0 ${(qs[0]?.attempts ?? 0) > 0 ? "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]" : "bg-muted text-muted-foreground"}`}>
                          {qs[0]?.attempts ?? 0}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge className={`text-[10px] border-0 ${fjs.length > 0 ? "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)]" : "bg-muted text-muted-foreground"}`}>
                          {fjs.length}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge className={`text-[10px] border-0 ${f.learning_attempts > 0 ? "bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)]" : "bg-muted text-muted-foreground"}`}>
                          {f.learning_attempts ?? 0}
                        </Badge>
                      </td>
                      <td className="p-2 text-[10px] text-muted-foreground">
                        {manualSince ? fmt(manualSince) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">
          <strong>Parse</strong>: tentativas de leitura via prospeccao-analyze · <strong>Fila</strong>: tentativas no worker assíncrono ·
          <strong> Failed</strong>: registros arquivados em failed_jobs · <strong>Apz.</strong>: envios ao módulo de Aprendizado.
          Na 2ª falha consecutiva (não rate-limit), o arquivo é movido automaticamente para <em>Upload manual exigido</em>.
        </p>
      </CardContent>
    </Card>
  );
}
