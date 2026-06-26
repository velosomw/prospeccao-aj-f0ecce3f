import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, GraduationCap, Loader2, RefreshCw, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Props {
  /** Pode passar rma_id direto OU companyId — se vier só companyId, resolve do banco. */
  rmaId?: string | null;
  companyId?: string | null;
}

interface FailedFile {
  file_id: string;
  file_name: string;
  path: string;
  status: string;
  mime_type: string | null;
  error_message: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  error: "erro",
  tracked: "pendente",
  new: "novo",
  updated: "atualizado",
  pending: "fila",
};

const STATUS_COLOR: Record<string, string> = {
  error: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)]",
  tracked: "bg-muted text-muted-foreground",
  new: "bg-blue-500/15 text-blue-700",
  updated: "bg-blue-500/15 text-blue-700",
  pending: "bg-amber-500/15 text-amber-700",
};

export default function RMAFailedFilesLearningCard({ rmaId, companyId }: Props) {
  const [resolvedRmaId, setResolvedRmaId] = useState<string | null>(rmaId ?? null);
  const [files, setFiles] = useState<FailedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  // Resolve rma_id a partir do companyId quando necessário
  useEffect(() => {
    if (resolvedRmaId || !companyId) return;
    supabase
      .from("companies")
      .select("rma_id")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.rma_id) setResolvedRmaId(data.rma_id);
      });
  }, [companyId, resolvedRmaId]);

  const load = async () => {
    if (!resolvedRmaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("onedrive_files")
      .select("file_id, file_name, path, status, mime_type, error_message")
      .eq("rma_id", resolvedRmaId)
      .in("status", ["error", "tracked", "new", "updated", "pending"])
      .order("status", { ascending: true })
      .order("path", { ascending: true })
      .limit(500);
    setLoading(false);
    if (error) {
      toast.error(`Falha ao carregar: ${error.message}`);
      return;
    }
    setFiles((data as FailedFile[]) ?? []);
  };

  useEffect(() => {
    if (resolvedRmaId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedRmaId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of files) c[f.status] = (c[f.status] ?? 0) + 1;
    return c;
  }, [files]);

  const sendOne = async (f: FailedFile) => {
    setSending((s) => ({ ...s, [f.file_id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("learning-from-pipeline", {
        body: { file_id: f.file_id, rma_id: resolvedRmaId },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Falha desconhecida");
      toast.success(`✓ ${f.file_name} enviado ao aprendizado`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`✕ ${f.file_name}: ${msg}`);
    } finally {
      setSending((s) => ({ ...s, [f.file_id]: false }));
    }
  };

  const sendBulk = async () => {
    const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) {
      toast.info("Selecione ao menos um arquivo");
      return;
    }
    setBulkRunning(true);
    let ok = 0, fail = 0;
    for (const id of ids) {
      const f = files.find((x) => x.file_id === id);
      if (!f) continue;
      try {
        await sendOne(f);
        ok++;
      } catch {
        fail++;
      }
      // pequeno spacing para não estourar quotas
      await new Promise((r) => setTimeout(r, 600));
    }
    setBulkRunning(false);
    toast.message(`Lote concluído: ${ok} ok · ${fail} erros`);
    setSelected({});
  };

  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    if (v) for (const f of files) next[f.file_id] = true;
    setSelected(next);
  };

  const allSelected = files.length > 0 && files.every((f) => selected[f.file_id]);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <Card className="border-2 border-[hsl(258,90%,66%)]/30 bg-[hsl(258,90%,66%)]/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[hsl(258,90%,56%)]" />
              Arquivos com erro / pendentes — Enviar para Aprendizado IA
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Reenvia o arquivo do OneDrive para o pipeline de aprendizado (OCR + IA + validação humana). Não consome a fila normal nem aciona o circuit breaker.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Link to="/gestor-ia/aprendizado">
              <Button variant="outline" size="sm" className="gap-1">
                <ExternalLink className="w-3.5 h-3.5" />
                Validar no Aprendizado
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {Object.entries(counts).map(([s, n]) => (
            <Badge key={s} className={`text-[10px] border-0 ${STATUS_COLOR[s] ?? "bg-muted"}`}>
              {STATUS_LABEL[s] ?? s}: {n}
            </Badge>
          ))}
          {files.length === 0 && !loading && (
            <span className="text-[11px] text-muted-foreground">Nenhum arquivo pendente.</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando arquivos…
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700 py-6 justify-center">
            <CheckCircle2 className="w-4 h-4" /> Sem arquivos com erro/pendentes neste RMA.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleAll(!!v)}
                />
                Selecionar todos ({files.length})
              </label>
              <Button
                size="sm"
                onClick={sendBulk}
                disabled={selectedCount === 0 || bulkRunning}
                className="gap-1 bg-[hsl(258,90%,56%)] hover:bg-[hsl(258,90%,50%)]"
              >
                {bulkRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Enviar {selectedCount > 0 ? `(${selectedCount})` : ""} ao aprendizado
              </Button>
            </div>
            <ScrollArea className="h-[420px] rounded-md border border-border/40">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background z-10 border-b border-border/40">
                  <tr>
                    <th className="w-8 p-2"></th>
                    <th className="text-left p-2 font-semibold text-muted-foreground">Arquivo</th>
                    <th className="text-left p-2 font-semibold text-muted-foreground hidden md:table-cell">Pasta</th>
                    <th className="text-center p-2 font-semibold text-muted-foreground w-20">Status</th>
                    <th className="text-center p-2 font-semibold text-muted-foreground w-32">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => {
                    const folder = f.path.split("/").slice(-2, -1)[0] ?? "";
                    return (
                      <tr key={f.file_id} className="border-b border-border/10 hover:bg-muted/20">
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={!!selected[f.file_id]}
                            onCheckedChange={(v) =>
                              setSelected((s) => ({ ...s, [f.file_id]: !!v }))
                            }
                          />
                        </td>
                        <td className="p-2">
                          <p className="font-medium leading-tight break-all">{f.file_name}</p>
                          {f.error_message && (
                            <p className="text-[10px] text-[hsl(0,84%,60%)] mt-0.5 leading-tight flex items-start gap-1">
                              <AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" />
                              <span className="line-clamp-2">{f.error_message}</span>
                            </p>
                          )}
                        </td>
                        <td className="p-2 hidden md:table-cell text-muted-foreground text-[11px] truncate max-w-[180px]" title={f.path}>
                          {folder}
                        </td>
                        <td className="p-2 text-center">
                          <Badge className={`text-[10px] border-0 ${STATUS_COLOR[f.status] ?? "bg-muted"}`}>
                            {STATUS_LABEL[f.status] ?? f.status}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendOne(f)}
                            disabled={!!sending[f.file_id]}
                            className="gap-1 h-7 text-[11px]"
                          >
                            {sending[f.file_id] ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <GraduationCap className="w-3 h-3" />
                            )}
                            Aprender
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
