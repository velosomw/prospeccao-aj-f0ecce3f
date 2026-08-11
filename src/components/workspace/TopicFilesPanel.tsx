// Lista de arquivos vinculados a um tópico do Prospecção — usado na aba
// "Revisão Inteligente" ao expandir um tópico. Mostra apenas nome do
// arquivo + status de processamento. Reflete em tempo real quaisquer
// mudanças feitas em /treinar-ia (mesma fonte: onedrive_files).
import { useEffect, useMemo, useState } from "react";
import { Loader2, FileText, CheckCircle2, AlertOctagon, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fileMatchesTopic, isTempOrHiddenFile } from "@/lib/topicMatch";
import { subscribeLearningUploadStatuses } from "@/utils/learningUploadStatus";

interface Props {
  prospecçãoId: string | null | undefined;
  topicNumber: number;
}

interface Row {
  file_id: string;
  file_name: string | null;
  path: string | null;
  status: string | null;
  updated_at: string | null;
}

const STATUS_META: Record<string, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  processed:            { label: "Processado",        color: "hsl(142,76%,36%)", Icon: CheckCircle2 },
  done:                 { label: "Concluído",         color: "hsl(142,76%,36%)", Icon: CheckCircle2 },
  completed:            { label: "Concluído",         color: "hsl(142,76%,36%)", Icon: CheckCircle2 },
  manual_uploaded:      { label: "Enviado manual",    color: "hsl(142,76%,36%)", Icon: CheckCircle2 },
  processing:           { label: "Processando",       color: "hsl(217,91%,50%)", Icon: Loader2 },
  in_progress:          { label: "Processando",       color: "hsl(217,91%,50%)", Icon: Loader2 },
  queued:               { label: "Na fila",           color: "hsl(217,91%,50%)", Icon: Clock },
  pending:              { label: "Pendente",          color: "hsl(38,92%,50%)",  Icon: Clock },
  new:                  { label: "Novo",              color: "hsl(38,92%,50%)",  Icon: Clock },
  updated:              { label: "Atualizado",        color: "hsl(38,92%,50%)",  Icon: Clock },
  manual_upload_required:{label: "Upload necessário", color: "hsl(38,92%,50%)",  Icon: AlertOctagon },
  error:                { label: "Erro",              color: "hsl(0,84%,60%)",   Icon: AlertOctagon },
  failed:               { label: "Falha",             color: "hsl(0,84%,60%)",   Icon: AlertOctagon },
};

function statusMeta(s: string | null | undefined) {
  const k = (s || "").toLowerCase();
  return STATUS_META[k] || { label: s || "—", color: "hsl(0,0%,40%)", Icon: FileText };
}

export default function TopicFilesPanel({ prospecçãoId, topicNumber }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!prospecçãoId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("onedrive_files")
          .select("file_id, file_name, path, status, updated_at")
          .eq("prospecção_id", prospecçãoId)
          .limit(2000);
        if (cancelled) return;
        setRows((data || []) as Row[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [prospecçãoId, tick]);

  // Reflete correções feitas em /treinar-ia (mesma fonte): refresca quando
  // statuses locais mudam ou quando o realtime do onedrive_files dispara.
  useEffect(() => {
    if (!prospecçãoId) return;
    const off = subscribeLearningUploadStatuses(() => setTick((t) => t + 1));
    const channel = supabase
      .channel(`topic-files-${prospecçãoId}-${topicNumber}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "onedrive_files", filter: `prospecção_id=eq.${prospecçãoId}` },
        () => setTick((t) => t + 1),
      )
      .subscribe();
    return () => { off?.(); supabase.removeChannel(channel); };
  }, [prospecçãoId, topicNumber]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => !isTempOrHiddenFile(r.file_name))
      .filter((r) => fileMatchesTopic({ path: r.path, file_name: r.file_name }, topicNumber))
      .sort((a, b) => (a.file_name || "").localeCompare(b.file_name || ""));
  }, [rows, topicNumber]);

  if (!prospecçãoId) {
    return <div className="text-xs text-muted-foreground px-3 py-3">Prospecção AJ não definido.</div>;
  }

  return (
    <div className="border-t bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
          Arquivos da pasta ({filtered.length})
        </span>
        <button
          onClick={() => setTick((t) => t + 1)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Atualizar
        </button>
      </div>
      {loading && filtered.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando arquivos…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3">
          Nenhum arquivo encontrado nesta pasta/tópico.
        </div>
      ) : (
        <ul className="divide-y border rounded-md bg-white">
          {filtered.map((r) => {
            const m = statusMeta(r.status);
            return (
              <li key={r.file_id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 truncate text-foreground" title={r.path || ""}>
                  {r.file_name || "(sem nome)"}
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                  style={{ background: `color-mix(in srgb, ${m.color} 14%, white)`, color: m.color }}
                >
                  <m.Icon className={`w-3 h-3 ${m.Icon === Loader2 ? "animate-spin" : ""}`} />
                  {m.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
