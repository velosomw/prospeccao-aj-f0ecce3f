import { useEffect, useState, useCallback } from "react";
import PlatformLayout from "@/components/PlatformLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  RefreshCw, RotateCcw, Search, AlertTriangle, CheckCircle2, Loader2, Eye, Zap,
} from "lucide-react";
import WorkerControlCard from "@/components/gestor/WorkerControlCard";

interface FailedJob {
  id: string;
  original_queue_id: string | null;
  file_id: string;
  company_id: string | null;
  prospecção_id: string | null;
  ano: number | null;
  mes: number | null;
  reason: string | null;
  attempts: number;
  error_message: string | null;
  payload: any;
  failed_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export default function GestorIAFailedJobs() {
  const [jobs, setJobs] = useState<FailedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "resolved" | "all">("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FailedJob | null>(null);
  const [requeueOpen, setRequeueOpen] = useState(false);
  const [resetAttempts, setResetAttempts] = useState<"reset" | "keep">("reset");
  const [requeuing, setRequeuing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, ok: 0, fail: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("failed_jobs")
      .select("*")
      .order("failed_at", { ascending: false })
      .limit(200);

    if (filter === "pending") query = query.is("resolved_at", null);
    if (filter === "resolved") query = query.not("resolved_at", "is", null);

    const { data, error } = await query;
    if (error) {
      toast.error("Erro ao carregar failed_jobs: " + error.message);
    } else {
      setJobs((data ?? []) as FailedJob[]);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = jobs.filter((j) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      j.file_id?.toLowerCase().includes(s) ||
      j.prospecção_id?.toLowerCase().includes(s) ||
      j.reason?.toLowerCase().includes(s) ||
      j.error_message?.toLowerCase().includes(s)
    );
  });

  const handleRequeue = async () => {
    if (!selected) return;
    setRequeuing(true);
    const { data, error } = await supabase.rpc("requeue_failed_job", {
      p_failed_id: selected.id,
      p_reset_attempts: resetAttempts === "reset",
    });
    setRequeuing(false);

    if (error) {
      toast.error("Falha ao reprocessar: " + error.message);
      return;
    }
    toast.success(`Job reenfileirado (queue id: ${String(data).slice(0, 8)}…)`);
    setRequeueOpen(false);
    setSelected(null);
    load();
  };

  const triggerWorker = async () => {
    const { error } = await supabase.functions.invoke("process-queue", {
      body: { concurrency: 3, maxJobs: 10 },
    });
    if (error) toast.error("Falha ao acionar worker: " + error.message);
    else toast.success("Worker acionado");
  };

  const handleBulkRequeue = async () => {
    const pending = filtered.filter((j) => !j.resolved_at);
    if (pending.length === 0) {
      toast.info("Nenhum job pendente para reprocessar");
      return;
    }
    if (!confirm(`Reprocessar ${pending.length} job(s)? O processo roda em lote com throttle.`)) return;

    setBulkRunning(true);
    setBulkProgress({ done: 0, total: pending.length, ok: 0, fail: 0 });

    let ok = 0;
    let fail = 0;
    const CONCURRENCY = 5;
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((j) =>
          supabase.rpc("requeue_failed_job", { p_failed_id: j.id, p_reset_attempts: true })
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled" && !r.value.error) ok++;
        else fail++;
      }
      setBulkProgress({ done: Math.min(i + CONCURRENCY, pending.length), total: pending.length, ok, fail });
      // pequena pausa entre lotes para não saturar
      await new Promise((res) => setTimeout(res, 500));
    }

    // dispara worker ao final
    await supabase.functions.invoke("process-queue", { body: { concurrency: 5, maxJobs: 50 } }).catch(() => {});

    setBulkRunning(false);
    toast.success(`Reprocessamento em lote concluído: ${ok} OK · ${fail} falhas`);
    load();
  };

  return (
    <PlatformLayout>
      <div className="space-y-6 p-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              Failed Jobs (DLQ)
            </h1>
            <p className="text-sm text-muted-foreground">
              Tarefas arquivadas após esgotamento de tentativas. Reprocesse ou marque como resolvido.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {bulkRunning && (
              <span className="text-xs text-muted-foreground font-mono">
                {bulkProgress.done}/{bulkProgress.total} · ✓{bulkProgress.ok} ✗{bulkProgress.fail}
              </span>
            )}
            <Button
              variant="default"
              onClick={handleBulkRequeue}
              disabled={bulkRunning || loading || filter === "resolved"}
              title="Reprocessa todos os jobs filtrados pendentes"
            >
              {bulkRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              Reprocessar todos filtrados
            </Button>
            <Button variant="outline" onClick={triggerWorker}>
              <RefreshCw className="h-4 w-4 mr-2" /> Acionar worker
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Atualizar
            </Button>
          </div>
        </header>

        <WorkerControlCard />



        <div className="flex flex-wrap items-center gap-3">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="resolved">Resolvidos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por file_id, Prospeccao AJ, motivo ou erro…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filtered.length} resultado(s)
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Falhou em</TableHead>
                <TableHead>File ID</TableHead>
                <TableHead>Prospeccao AJ / Período</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-center">Tentativas</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    Nenhum job na DLQ.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs">
                      {new Date(j.failed_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[160px] truncate" title={j.file_id}>
                      {j.file_id}
                    </TableCell>
                    <TableCell className="text-xs">
                      {j.prospecção_id ?? "—"}
                      {j.ano && j.mes ? ` · ${String(j.mes).padStart(2, "0")}/${j.ano}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{j.reason ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-mono">{j.attempts}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate text-destructive" title={j.error_message ?? ""}>
                      {j.error_message ?? "—"}
                    </TableCell>
                    <TableCell>
                      {j.resolved_at ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Resolvido
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSelected(j); setDetailOpen(true); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!j.resolved_at && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => { setSelected(j); setResetAttempts("reset"); setRequeueOpen(true); }}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" /> Reprocessar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog de reprocessamento */}
      <Dialog open={requeueOpen} onOpenChange={setRequeueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprocessar job</DialogTitle>
            <DialogDescription>
              O arquivo será reinserido na fila de processamento. Escolha como tratar o contador de tentativas.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">File ID</Label>
                <div className="font-mono text-xs break-all">{selected.file_id}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Prospeccao AJ</Label>
                  <div>{selected.prospecção_id ?? "—"}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tentativas anteriores</Label>
                  <div className="font-mono">{selected.attempts}</div>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label>Tentativas no novo job</Label>
                <Select value={resetAttempts} onValueChange={(v: any) => setResetAttempts(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reset">Zerar (recomendado)</SelectItem>
                    <SelectItem value="keep">Manter ({selected.attempts})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRequeueOpen(false)} disabled={requeuing}>
              Cancelar
            </Button>
            <Button onClick={handleRequeue} disabled={requeuing}>
              {requeuing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confiprospecçãor reprocessamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de detalhes */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do job</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm max-h-[60vh] overflow-auto">
              <div>
                <Label className="text-xs text-muted-foreground">Erro</Label>
                <pre className="bg-muted p-2 rounded text-xs whitespace-pre-wrap break-all">
                  {selected.error_message ?? "—"}
                </pre>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Payload</Label>
                <pre className="bg-muted p-2 rounded text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
              {selected.resolution_notes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Notas de resolução</Label>
                  <pre className="bg-muted p-2 rounded text-xs whitespace-pre-wrap">
                    {selected.resolution_notes}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PlatformLayout>
  );
}
