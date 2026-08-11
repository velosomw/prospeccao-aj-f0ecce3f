import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-any";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hourglass, Clock, CheckCircle2, AlertCircle, FolderOpen, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FolderRow {
  folder_path: string;
  in_batch_count: number;
  done_count: number;
  failed_count: number;
  total_count: number;
  earliest_eta: string | null;
  latest_eta: string | null;
}

interface JobRow {
  id: string;
  file_id: string;
  file_name: string;
  folder_path: string | null;
  status: string;
  engine: string;
  file_size_bytes: number | null;
  page_count_estimate: number | null;
  submitted_at: string | null;
  eta_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
}

function formatEta(target: string | null): string {
  if (!target) return "—";
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return "a qualquer momento";
  const h = Math.ceil(ms / 3600000);
  if (h <= 1) return "em ~1h";
  return `em até ${h}h`;
}

function formatBytes(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Reduz um caminho completo (ex: "Projeto Prospeccao/EMPRESA/2026/02.2026/04 - Nome")
 * para "/02.2026/04 - Nome" — destacando Mês.Ano e a subpasta.
 */
function formatFolderShort(path: string): string {
  if (!path) return "—";
  const parts = path.split("/").filter(Boolean);
  // procura segmento no formato MM.AAAA
  const idx = parts.findIndex((p) => /^\d{2}\.\d{4}$/.test(p));
  if (idx >= 0) {
    return "/" + parts.slice(idx).join("/");
  }
  // fallback: últimos 2 segmentos
  return "/" + parts.slice(-2).join("/");
}

function statusBadge(s: string) {
  if (s === "done") return <Badge variant="outline" className="border-green-300 text-green-700 gap-1"><CheckCircle2 className="h-3 w-3" />Concluído</Badge>;
  if (s === "failed") return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Falha</Badge>;
  if (s === "processing" || s === "submitted") return <Badge className="bg-primary/15 text-primary border-0 gap-1"><Hourglass className="h-3 w-3 animate-pulse" />Em batch</Badge>;
  if (s === "queued") return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Na fila</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

interface Props {
  companyId: string | null;
  prospeccaoId?: string | null;
}

/**
 * Aba "Batch & Fila": mostra estado de processamento batch (Document AI off-peak)
 * por pasta e por arquivo. Persiste no banco — sobrevive a logout/login.
 */
export default function ProspeccaoBatchTab({ companyId, prospeccaoId }: Props) {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const fetchAll = async () => {
      let fq = supabase
        .from("folder_deferred_status" as never)
        .select("folder_path, in_batch_count, done_count, failed_count, total_count, earliest_eta, latest_eta")
        .eq("company_id", companyId);
      if (prospeccaoId) fq = fq.eq("prospeccao_id", prospeccaoId);

      let jq = supabase
        .from("deferred_jobs")
        .select("id, file_id, file_name, folder_path, status, engine, file_size_bytes, page_count_estimate, submitted_at, eta_at, completed_at, error_message, attempts, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (prospeccaoId) jq = jq.eq("prospeccao_id", prospeccaoId);

      const [{ data: f }, { data: j }] = await Promise.all([fq, jq]);
      if (cancelled) return;
      setFolders((f as unknown as FolderRow[]) ?? []);
      setJobs((j as unknown as JobRow[]) ?? []);
      setLoading(false);
    };
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [companyId, prospeccaoId, refreshKey]);

  if (!companyId) {
    return <div className="text-sm text-muted-foreground p-6">Workspace de demonstração — sem dados de batch.</div>;
  }

  const totalInBatch = folders.reduce((s, f) => s + (f.in_batch_count ?? 0), 0);
  const totalDone = folders.reduce((s, f) => s + (f.done_count ?? 0), 0);
  const totalFailed = folders.reduce((s, f) => s + (f.failed_count ?? 0), 0);
  const earliestEta = folders.map(f => f.earliest_eta).filter(Boolean).sort()[0] ?? null;
  const latestEta = folders.map(f => f.latest_eta).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Hourglass className="h-4 w-4 text-primary" />
              Processamento batch (Document AI off-peak)
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setRefreshKey(k => k + 1)}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : folders.length === 0 && jobs.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhum arquivo em fila batch. Arquivos grandes (&gt;10MB ou &gt;50 páginas) entram automaticamente na fila econômica (~50% mais barata, conclui em até 24h).
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Em fila/processando</div>
                <div className="text-2xl font-bold text-primary">{totalInBatch}</div>
                {totalInBatch > 0 && <div className="text-xs text-muted-foreground mt-1">{formatEta(latestEta)}</div>}
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Concluídos</div>
                <div className="text-2xl font-bold text-green-600">{totalDone}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Falhas</div>
                <div className="text-2xl font-bold text-destructive">{totalFailed}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Próxima conclusão</div>
                <div className="text-sm font-semibold mt-1">{earliestEta ? formatEta(earliestEta) : "—"}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Por pasta */}
      {folders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Por pasta ({folders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {folders.map((f) => (
                <div key={f.folder_path} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{f.folder_path}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.total_count} arquivo(s) · {f.in_batch_count} em batch · {f.done_count} ok · {f.failed_count} falha
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {f.in_batch_count > 0 && (
                      <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary gap-1">
                        <Clock className="h-3 w-3" /> {formatEta(f.latest_eta)}
                      </Badge>
                    )}
                    {f.done_count > 0 && f.in_batch_count === 0 && (
                      <Badge variant="outline" className="border-green-300 text-green-700 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Completo
                      </Badge>
                    )}
                    {f.failed_count > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> {f.failed_count}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Por arquivo */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Por arquivo ({jobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left p-2 font-medium">Arquivo</th>
                  <th className="text-left p-2 font-medium">Pasta</th>
                  <th className="text-left p-2 font-medium">Tamanho</th>
                  <th className="text-left p-2 font-medium">Pgs</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-left p-2 font-medium">ETA / Concluído</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2 font-medium max-w-[260px] truncate" title={j.file_name}>{j.file_name}</td>
                    <td className="p-2 max-w-[260px] truncate" title={j.folder_path ?? ""}>
                      {j.folder_path ? (
                        <a
                          href={`#folder=${encodeURIComponent(j.folder_path)}`}
                          className="text-primary hover:underline truncate inline-block max-w-full align-middle"
                        >
                          {formatFolderShort(j.folder_path)}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2">{formatBytes(j.file_size_bytes)}</td>
                    <td className="p-2">{j.page_count_estimate ?? "—"}</td>
                    <td className="p-2">{statusBadge(j.status)}</td>
                    <td className="p-2 text-muted-foreground">
                      {j.status === "done" && j.completed_at
                        ? new Date(j.completed_at).toLocaleString("pt-BR")
                        : j.status === "failed"
                          ? <span className="text-destructive">{j.error_message ?? "erro"}</span>
                          : formatEta(j.eta_at)}
                      {j.attempts > 1 && <span className="ml-1 text-[10px]">(tent. {j.attempts})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
