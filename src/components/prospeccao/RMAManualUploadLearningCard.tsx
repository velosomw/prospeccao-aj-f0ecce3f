import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Upload, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { uploadLearningFile, extractTextFromFile, processWithAI, markExtractionAsLearning } from "@/services/learningService";

interface Props {
  prospeccaoId?: string | null;
  companyId?: string | null;
}

interface Row {
  file_id: string;
  file_name: string;
  path: string;
  mime_type: string | null;
  last_learning_error: string | null;
  learning_attempts: number;
}

export default function ProspeccaoManualUploadLearningCard({ prospeccaoId, companyId }: Props) {
  const [resolvedRmaId, setResolvedRmaId] = useState<string | null>(prospeccaoId ?? null);
  const [files, setFiles] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (resolvedRmaId || !companyId) return;
    supabase.from("companies").select("prospeccao_id").eq("id", companyId).maybeSingle()
      .then(({ data }) => { if (data?.prospeccao_id) setResolvedRmaId(data.prospeccao_id); });
  }, [companyId, resolvedRmaId]);

  const load = async () => {
    if (!resolvedRmaId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("onedrive_files")
      .select("file_id, file_name, path, mime_type, last_learning_error, learning_attempts")
      .eq("prospeccao_id", resolvedRmaId)
      .eq("requires_manual_upload", true)
      .order("path", { ascending: true })
      .limit(500);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setFiles((data as Row[]) ?? []);
  };

  useEffect(() => { if (resolvedRmaId) load(); /* eslint-disable-next-line */ }, [resolvedRmaId]);

  const handleManualUpload = async (row: Row, file: File) => {
    setUploading((s) => ({ ...s, [row.file_id]: true }));
    try {
      const uploaded = await uploadLearningFile(file);
      const ext = await extractTextFromFile(file, uploaded);
      const ai: any = await processWithAI({
        rawText: ext.rawText,
        normalizedText: ext.normalizedText,
        path: uploaded.path,
        ocrConfidence: (ext as any).ocrConfidence ?? null,
      });
      if (ai?.id) await markExtractionAsLearning(ai.id, {
        path: uploaded.path,
        mimeType: uploaded.mimeType,
        fileName: uploaded.fileName,
      });
      // limpa flag de manual upload no tracker
      await supabase
        .from("onedrive_files")
        .update({
          requires_manual_upload: false,
          last_learning_error: null,
          last_learning_at: new Date().toISOString(),
          status: "manual_uploaded",
        })
        .eq("file_id", row.file_id);
      toast.success(`✓ ${row.file_name} substituído e enviado ao aprendizado`);
      setFiles((prev) => prev.filter((f) => f.file_id !== row.file_id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading((s) => ({ ...s, [row.file_id]: false }));
    }
  };

  return (
    <Card className="border-2 border-[hsl(0,84%,60%)]/30 bg-[hsl(0,84%,60%)]/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4 text-[hsl(0,84%,60%)]" />
              Upload manual exigido — {files.length} arquivo(s)
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Estes arquivos falharam no envio automático ao aprendizado. Eles foram <strong>retirados da fila de processamento</strong> e
              <strong> não serão reexecutados</strong>. Faça o upload de uma nova versão (ou o mesmo arquivo a partir do disco) para enviá-lo manualmente ao aprendizado.
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700 py-6 justify-center">
            <CheckCircle2 className="w-4 h-4" /> Nenhum arquivo aguardando upload manual.
          </div>
        ) : (
          <ScrollArea className="h-[420px] rounded-md border border-border/40">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background z-10 border-b border-border/40">
                <tr>
                  <th className="text-left p-2 font-semibold text-muted-foreground">Arquivo</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground w-20">Tentativas</th>
                  <th className="text-center p-2 font-semibold text-muted-foreground w-44">Upload manual</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const folder = f.path.split("/").slice(-2, -1)[0] ?? "";
                  return (
                    <tr key={f.file_id} className="border-b border-border/10 hover:bg-muted/20 align-top">
                      <td className="p-2">
                        <p className="font-medium leading-tight break-all">{f.file_name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{folder}</p>
                        {f.last_learning_error && (
                          <p className="text-[10px] text-[hsl(0,84%,60%)] mt-0.5 leading-tight flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" />
                            <span className="line-clamp-2">{f.last_learning_error}</span>
                          </p>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <Badge className="bg-muted text-muted-foreground border-0 text-[10px]">
                          {f.learning_attempts}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <label className="inline-flex">
                          <input
                            type="file"
                            className="hidden"
                            disabled={!!uploading[f.file_id]}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleManualUpload(f, file);
                              e.target.value = "";
                            }}
                          />
                          <span className={`cursor-pointer inline-flex items-center gap-1 h-7 px-2 rounded border border-input bg-background hover:bg-accent text-[11px] ${uploading[f.file_id] ? "opacity-50 pointer-events-none" : ""}`}>
                            {uploading[f.file_id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            Selecionar arquivo
                          </span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
