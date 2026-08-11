// Painel "Arquivos com erro" — lista docs pendentes/com falha do Prospeccao selecionado,
// agrupa por pasta DIP (via agente) e permite abrir o LearningUploadPanel inline
// com a pasta correspondente pré-selecionada, para reupload manual estratégico.
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, FolderOpen, FileWarning, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DIP_FOLDERS, dipFolderSlug, type DipFolder } from "@/data/dipFolders";
import LearningUploadPanel from "@/components/workspace/stages/LearningUploadPanel";
import { toast } from "sonner";
import { listLearningUploadStatuses, subscribeLearningUploadStatuses } from "@/utils/learningUploadStatus";
import { buildFolderAliasMap, buildPathInFolder, findFolderLocationForDip, getPathFolderSegment, matchDipFolderBySegment } from "@/utils/dipFolderPaths";
import { buildFolderNumbering } from "@/utils/dipFolderNumbering";

interface Props {
  prospecçãoId: string;
  companyId: string | null;
}

interface PendingDoc {
  extraction_id: string;
  path: string | null;
  classe: string | null;
  agent: string | null;
  status: string;
  final_confidence: number | null;
  file_name: string | null;
  reference_month?: string | null; // YYYY-MM
}

// Map: agent → primeira pasta DIP que usa esse agente (default razoável)
const AGENT_TO_FOLDER = new Map<string, DipFolder>();
for (const f of DIP_FOLDERS) {
  if (!AGENT_TO_FOLDER.has(f.agent)) AGENT_TO_FOLDER.set(f.agent, f);
}

function resolveFolder(doc: PendingDoc, aliases: Map<string, string>): DipFolder {
  if (doc.path) {
    const seg = getPathFolderSegment(doc.path);
    const canonicalSeg = aliases.get(seg) || seg;
    const byName = matchDipFolderBySegment(canonicalSeg);
    if (byName) return byName;
    const m = doc.path.match(/(?:^|\/)(\d{1,2})[-_ ]/);
    if (m) {
      const id = Number(m[1]);
      const f = DIP_FOLDERS.find(x => x.id === id);
      if (f) return f;
    }
  }
  if (doc.agent && AGENT_TO_FOLDER.has(doc.agent)) return AGENT_TO_FOLDER.get(doc.agent)!;
  return DIP_FOLDERS[0];
}

// Tenta extrair YYYY-MM de metadata.reference_month, ou de padrões no path/nome
const MONTH_MAP: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};
function resolveRefMonth(metaMonth: string | null | undefined, path: string | null, fileName: string | null): string | null {
  if (metaMonth && /^\d{4}-\d{2}$/.test(metaMonth)) return metaMonth;
  const hay = `${path ?? ""} ${fileName ?? ""}`.toLowerCase();
  // YYYY-MM ou YYYY_MM
  let m = hay.match(/(20\d{2})[-_/.](0[1-9]|1[0-2])/);
  if (m) return `${m[1]}-${m[2]}`;
  // MM-YYYY
  m = hay.match(/(0[1-9]|1[0-2])[-_/.](20\d{2})/);
  if (m) return `${m[2]}-${m[1]}`;
  // nome do mês + ano  (ex: "jan-2026", "janeiro 2026", "nov.2025")
  m = hay.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zçí]*[\s\-_./]*(20\d{2})/);
  if (m) return `${m[2]}-${MONTH_MAP[m[1]]}`;
  return null;
}

const MONTH_LABEL: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun",
  "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};
const fmtMonth = (k: string) => `${MONTH_LABEL[k.slice(5, 7)]}/${k.slice(0, 4)}`;

export default function ErrorFilesPanel({ prospecçãoId, companyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  // Override de pasta por documento (definido pelo LearningUploadPanel quando o
  // usuário escolhe outra pasta). Aplicado ANTES do reprocessamento para mover
  // o arquivo para a pasta correspondente no OneDrive.
  const [folderOverrides, setFolderOverrides] = useState<Record<string, number>>({});
  const [aliasMap, setAliasMap] = useState<Map<string, string>>(new Map());
  const [localStatuses, setLocalStatuses] = useState(() => listLearningUploadStatuses(prospecçãoId));

  useEffect(() => {
    const refresh = () => setLocalStatuses(listLearningUploadStatuses(prospecçãoId));
    refresh();
    return subscribeLearningUploadStatuses(refresh);
  }, [prospecçãoId]);

  const [monthFilter, setMonthFilter] = useState<string>("all");


  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("vw_training_pending")
        .select("extraction_id, path, classe, agent, status, final_confidence, file_name")
        .limit(500);
      if (prospecçãoId) q = q.eq("prospecção_id", prospecçãoId);

      // Inclui qualquer arquivo do OneDrive que NÃO esteja finalizado:
      // processando, na fila, novo, atualizado, falho ou parado sem status final.
      // IMPORTANTE: `processed` é o status de sucesso real do pipeline — precisa
      // ficar FORA desta lista para não vazar arquivos OK como "parados/falhas".
      let pq = supabase
        .from("onedrive_files")
        .select("file_id, file_name, path, status, last_learning_at, last_learning_error, metadata, updated_at")
        .not("status", "in", "(done,completed,processed,manual_uploaded,ignored,inactive)")
        .limit(500);
      if (prospecçãoId) pq = pq.eq("prospecção_id", prospecçãoId);

      // Arquivos JÁ finalizados — usados para deduplicar entradas antigas de
      // "falha" que continuam na view pendente. Inclui `processed` (sucesso pipeline).
      let doneQ = supabase
        .from("onedrive_files")
        .select("file_name, path")
        .in("status", ["done", "completed", "processed", "manual_uploaded"])
        .limit(5000);
      if (prospecçãoId) doneQ = doneQ.eq("prospecção_id", prospecçãoId);

      // TODOS os arquivos do Prospeccao — usados para reproduzir o mesmo agrupamento
      // canônico de pastas que o Worker OneDrive exibe (mesmo alias map).
      let allQ = supabase
        .from("onedrive_files")
        .select("path, metadata")
        .limit(5000);
      if (prospecçãoId) allQ = allQ.eq("prospecção_id", prospecçãoId);

      const [{ data, error }, { data: procRows, error: procErr }, { data: doneRows }, { data: allRows }] =
        await Promise.all([q, pq, doneQ, allQ]);
      if (error) throw error;
      if (procErr) throw procErr;

      const finalizedKeys = new Set<string>();
      for (const r of (doneRows ?? []) as any[]) {
        if (r.file_name) finalizedKeys.add(String(r.file_name).toLowerCase());
        if (r.path) {
          const tail = String(r.path).split("/").pop();
          if (tail) finalizedKeys.add(tail.toLowerCase());
        }
      }

      const rank = (s: string) => (s === "processing" || s === "queued" || s === "pending" ? 4 : s === "failed" || s === "error" ? 3 : s === "new" || s === "updated" ? 2 : 1);
      const map = new Map<string, PendingDoc>();
      const put = (d: PendingDoc) => {
        const key = d.file_name?.toLowerCase() || d.path || d.extraction_id;
        // Dedup: se já foi finalizado em onedrive_files, não exibir como pendente/falha
        const nameKey = d.file_name?.toLowerCase();
        const pathTail = d.path?.split("/").pop()?.toLowerCase();
        if ((nameKey && finalizedKeys.has(nameKey)) || (pathTail && finalizedKeys.has(pathTail))) return;
        const prev = map.get(key);
        if (!prev || rank(d.status) > rank(prev.status)) map.set(key, d);
      };
      for (const d of ((data ?? []) as PendingDoc[])) {
        put({ ...d, reference_month: resolveRefMonth(null, d.path, d.file_name) });
      }
      for (const p of (procRows ?? []) as any[]) {
        const metaMonth = p.metadata?.reference_month ?? null;
        const status = ["processing", "queued", "pending"].includes(p.status)
          ? p.status
          : (p.status === "failed" || p.status === "error" || p.last_learning_error) ? "error" : "pending";
        put({
          extraction_id: `proc:${p.file_id}`,
          path: p.path ?? null,
          classe: null,
          agent: null,
          status,
          final_confidence: null,
          file_name: p.file_name ?? null,
          reference_month: resolveRefMonth(metaMonth, p.path, p.file_name),
        });
      }
      for (const s of localStatuses) {
        const key = s.fileName.toLowerCase();
        if (s.status === "done" || finalizedKeys.has(key)) { map.delete(key); continue; }
        put({
          extraction_id: `local:${key}`,
          path: s.path ?? null,
          classe: null,
          agent: null,
          status: s.status === "processing" ? "processing" : "error",
          final_confidence: s.confidence ?? null,
          file_name: s.fileName,
          reference_month: resolveRefMonth(null, s.path, s.fileName),
        });
      }
      // Mesmo alias map usado pelo Worker OneDrive — garante que cada arquivo
      // apareça na MESMA pasta canônica que o Worker mostra, sem duplicar.
      setAliasMap(buildFolderAliasMap((allRows ?? []) as any[]));
      setDocs(Array.from(map.values()));
    } catch (e: any) {
      toast.error(`Erro ao carregar: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [prospecçãoId, localStatuses]);

  useEffect(() => { load(); }, [load]);

  // Contagem por mês (sobre TODOS os docs, antes do filtro)
  const monthCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) {
      const k = d.reference_month ?? "sem-mes";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [docs]);

  const monthKeys = useMemo(() => {
    const keys = Array.from(monthCounts.keys()).filter(k => k !== "sem-mes").sort().reverse();
    if (monthCounts.has("sem-mes")) keys.push("sem-mes");
    return keys;
  }, [monthCounts]);

  const filteredDocs = useMemo(() => {
    if (monthFilter === "all") return docs;
    return docs.filter(d => (d.reference_month ?? "sem-mes") === monthFilter);
  }, [docs, monthFilter]);

  // Agrupa por folder.id usando o alias map do Worker para garantir
  // correspondência 1:1 entre as pastas exibidas aqui e no Worker OneDrive.
  const grouped = useMemo(() => {
    const map = new Map<number, { folder: DipFolder; items: PendingDoc[] }>();
    for (const d of filteredDocs) {
      const f = resolveFolder(d, aliasMap);
      if (!map.has(f.id)) map.set(f.id, { folder: f, items: [] });
      map.get(f.id)!.items.push(d);
    }
    return Array.from(map.values()).sort((a, b) => a.folder.id - b.folder.id);
  }, [filteredDocs, aliasMap]);

  const numbering = useMemo(
    () => buildFolderNumbering(grouped.map((g) => g.folder.id)),
    [grouped],
  );

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const totalErros = filteredDocs.filter(d => d.status === "failed" || d.status === "error").length;
  const totalParados = filteredDocs.filter(d => ["new", "updated", "pending"].includes(d.status)).length;
  const totalProcessando = filteredDocs.filter(d => ["processing", "queued", "pending"].includes(d.status)).length;
  const pctProcessando = filteredDocs.length > 0 ? Math.round((totalProcessando / filteredDocs.length) * 100) : 0;

  const bulkReprocess = useCallback(async (items: PendingDoc[], label: "falha" | "parado") => {
    const procItems = items.filter(i => i.extraction_id.startsWith("proc:"));
    if (procItems.length === 0) {
      toast.error("Nenhum arquivo elegível (somente arquivos do OneDrive podem ser reenfileirados).");
      return;
    }
    const t = toast.loading(`Reenfileirando ${procItems.length} ${label}${procItems.length > 1 ? "s" : ""}…`);
    let ok = 0, fail = 0, moved = 0;
    for (const it of procItems) {
      const file_id = it.extraction_id.slice(5);
      // Se o usuário escolheu outra pasta no painel de upload, move o arquivo
      // ANTES do reprocessamento para garantir a correspondência correta.
      const overrideId = folderOverrides[it.extraction_id];
      if (overrideId != null) {
        const target = DIP_FOLDERS.find(f => f.id === overrideId);
        const currentFolderName = getPathFolderSegment(it.path).toLowerCase();
        const currentFolder = matchDipFolderBySegment(currentFolderName);
        const isDifferent = target && currentFolder?.id !== target.id;
        if (target && isDifferent) {
          try {
            const fileName = it.file_name ?? (it.path?.split("/").pop() ?? "");
            const targetLocation = findFolderLocationForDip(docs.map((d) => ({ path: d.path })), target);
            const newPath = buildPathInFolder(it.path, fileName, targetLocation.folderPath, targetLocation.segment);
            const { data: cur } = await supabase
              .from("onedrive_files")
              .select("metadata")
              .eq("file_id", file_id)
              .maybeSingle();
            const prevMeta = (cur?.metadata as Record<string, unknown> | null) ?? {};
            await supabase
              .from("onedrive_files")
              .update({
                path: newPath,
                metadata: {
                  ...prevMeta,
                  corrected_folder_id: target.id,
                  corrected_folder_slug: dipFolderSlug(target),
                  corrected_folder_label: target.label,
                  corrected_folder_segment: targetLocation.segment,
                  original_folder_slug: currentFolderName || null,
                  corrected_at: new Date().toISOString(),
                  moved_by_manual_upload: true,
                },
              })
              .eq("file_id", file_id);
            moved++;
          } catch (err) {
            console.warn("folder override failed for", file_id, err);
          }
        }
      }
      const { error } = await supabase.functions.invoke("reprocess-file", { body: { file_id } });
      if (error) fail++; else ok++;
    }
    toast.dismiss(t);
    if (moved) toast.success(`${moved} arquivo(s) movido(s) para a pasta selecionada.`);
    if (ok) toast.success(`${ok} arquivo${ok > 1 ? "s" : ""} enfileirado${ok > 1 ? "s" : ""} para processamento.`);
    if (fail) toast.error(`${fail} falha${fail > 1 ? "s" : ""} ao enfileirar.`);
    load();
  }, [load, folderOverrides, docs]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <FileWarning className="h-4 w-4 text-rose-600" />
          <h3 className="text-sm font-semibold">Arquivos com erro / não processados</h3>
          <Badge variant="destructive" className="text-xs">{totalErros} falhas</Badge>
          <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">{totalParados} parados</Badge>
          <Badge variant="secondary" className="text-xs">{filteredDocs.length} total</Badge>
          {totalProcessando > 0 && (
            <Badge
              variant="secondary"
              className={`text-xs ${pctProcessando === 100 ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"}`}
              title={`${totalProcessando} de ${filteredDocs.length} em processamento`}
            >
              {pctProcessando}% em processamento
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              const elig = filteredDocs.filter(d =>
                ["failed", "error", "new", "updated", "pending"].includes(d.status)
                && d.extraction_id.startsWith("proc:")
              );
              if (elig.length === 0) {
                toast.error("Nenhum arquivo elegível no filtro atual.");
                return;
              }
              toast.info(`Reprocessando ${elig.length} arquivo(s) filtrado(s)...`);
              bulkReprocess(elig, "falha");
            }}
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reprocessar todos filtrados
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const elig = filteredDocs.filter(d =>
                ["failed", "error", "new", "updated", "pending", "manual_upload_required", "queued"].includes(d.status)
              );
              if (elig.length === 0) { toast.error("Nenhum arquivo elegível."); return; }
              const fileIds = elig.map(d => d.extraction_id.replace(/^proc:/, "")).slice(0, 200);
              try {
                const { data, error } = await supabase.functions.invoke("enqueue-manual-process", { body: { file_ids: fileIds } });
                if (error) throw error;
                toast.success(`Disparado: ${(data as any)?.enqueued ?? 0} arquivo(s) na fila manual`);
                load();
              } catch (e: any) {
                toast.error(e.message ?? "Falha ao disparar processamento manual");
              }
            }}
            disabled={loading}
            title="Força execução imediata ignorando o estado do worker"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Forçar processamento agora
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Filtro por mês de referência */}
      {monthKeys.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap border-b pb-2">
          <span className="text-[11px] text-muted-foreground mr-1">Mês:</span>
          <button
            onClick={() => setMonthFilter("all")}
            className={`px-2 py-0.5 rounded text-[11px] border ${monthFilter === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-background hover:bg-muted"}`}
          >
            Todos <span className="opacity-70">({docs.length})</span>
          </button>
          {monthKeys.map(k => (
            <button
              key={k}
              onClick={() => setMonthFilter(k)}
              className={`px-2 py-0.5 rounded text-[11px] border ${monthFilter === k ? "bg-blue-600 text-white border-blue-600" : "bg-background hover:bg-muted"}`}
            >
              {k === "sem-mes" ? "Sem mês" : fmtMonth(k)} <span className="opacity-70">({monthCounts.get(k)})</span>
            </button>
          ))}
        </div>
      )}

      {grouped.length === 0 && !loading && (
        <div className="text-center text-xs text-muted-foreground border border-dashed rounded-lg p-8">
          Nenhum arquivo com problema neste Prospeccao. 🎉
        </div>
      )}

      <div className="space-y-2">
        {grouped.map(({ folder, items }) => {
          const open = expanded.has(folder.id);
          const grpFalhas = items.filter(d => d.status === "failed" || d.status === "error");
          const grpParados = items.filter(d => ["new", "updated", "pending"].includes(d.status));
          const grpProc = items.filter(d => ["processing", "queued"].includes(d.status));
          return (
            <div key={folder.id} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(folder.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <FolderOpen className="h-4 w-4 text-amber-600 shrink-0" />
                  <Badge variant="outline" className="text-sm font-mono font-semibold shrink-0 border-blue-300 text-blue-700 px-3 py-0.5" title="Código canônico da pasta extraído do arquivo de referência 'Código de Pastas OneDrive'">
                    Código da Pasta {numbering.get(folder.id)?.onedriveNumber ?? String(folder.id).padStart(2, "0")}
                  </Badge>
                  <span className="text-sm font-medium truncate">{folder.label}</span>
                  <Badge variant="outline" className="text-[10px]">tópico #{folder.prospeccaoTopicNumber}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  {grpFalhas.length > 0 && (
                    <Badge variant="destructive" className="text-[10px]" title="Falhas">
                      {grpFalhas.length} falha{grpFalhas.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {grpParados.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800" title="Parados sem processar">
                      {grpParados.length} parado{grpParados.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {grpProc.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800" title="Em processamento">
                      {grpProc.length} proc.
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">{items.length} total</Badge>
                </div>
              </button>

              {open && (
                <>
                  {(grpFalhas.length > 0 || grpParados.length > 0) && (
                    <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-muted/30 border-t">
                      {grpParados.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={(e) => { e.stopPropagation(); bulkReprocess(grpParados, "parado"); }}
                        >
                          ▶ Colocar {grpParados.length} parado{grpParados.length > 1 ? "s" : ""} em execução
                        </Button>
                      )}
                      {grpFalhas.length > 0 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-[11px]"
                          onClick={(e) => { e.stopPropagation(); bulkReprocess(grpFalhas, "falha"); }}
                        >
                          ↻ Reprocessar {grpFalhas.length} falha{grpFalhas.length > 1 ? "s" : ""}
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="divide-y border-t bg-muted/20">
                    {items.map(it => {
                      const isActive = activeDoc === it.extraction_id;
                      const isStopped = ["new", "updated", "pending"].includes(it.status);
                      const isFailed = it.status === "failed" || it.status === "error";
                      const isProc = it.status === "processing" || it.status === "queued";
                      return (
                        <div key={it.extraction_id}>
                          <button
                            onClick={() => setActiveDoc(isActive ? null : it.extraction_id)}
                            className={`w-full text-left p-2.5 px-4 hover:bg-muted/60 flex items-center gap-2 ${isActive ? "bg-blue-50" : ""}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{it.file_name ?? it.path ?? it.extraction_id.slice(0, 8)}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {it.classe ?? "—"} · {it.agent ?? "—"}
                              </div>
                            </div>
                            {(() => {
                              const pct = it.final_confidence != null ? `${Math.round(it.final_confidence * 100)}%` : null;
                              if (isProc) {
                                return (
                                  <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800 gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Processando
                                  </Badge>
                                );
                              }
                              if (isStopped) {
                                return (
                                  <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800">
                                    Parado
                                  </Badge>
                                );
                              }
                              if (isFailed) {
                                return (
                                  <div className="flex items-center gap-1">
                                    {pct && <Badge variant="outline" className="text-[10px]">{pct}</Badge>}
                                    <Badge variant="destructive" className="text-[10px]">Falha</Badge>
                                  </div>
                                );
                              }
                              const low = it.final_confidence != null && it.final_confidence < 0.9;
                              return (
                                <div className="flex items-center gap-1">
                                  {pct && (
                                    <Badge
                                      variant={low ? "secondary" : "outline"}
                                      className={`text-[10px] ${low ? "bg-amber-100 text-amber-800" : ""}`}
                                    >
                                      {pct}
                                    </Badge>
                                  )}
                                  {low && <Badge variant="destructive" className="text-[10px]">Reenviar</Badge>}
                                </div>
                              );
                            })()}
                          </button>

                          {isActive && (
                            <div className="p-3 bg-white border-t space-y-2">
                              {it.extraction_id.startsWith("proc:") && (
                                <Button
                                  size="sm"
                                  variant={isFailed ? "destructive" : "outline"}
                                  className="h-7 text-[11px]"
                                  onClick={() => bulkReprocess([it], isFailed ? "falha" : "parado")}
                                >
                                  {isFailed ? "↻ Reprocessar este arquivo" : "▶ Colocar este em execução"}
                                </Button>
                              )}
                              <LearningUploadPanel
                                prospecçãoId={prospecçãoId}
                                companyId={companyId}
                                defaultFolderId={folder.id}
                                defaultFileName={it.file_name ?? undefined}
                                onFolderChange={(fid) =>
                                  setFolderOverrides((prev) => {
                                    const next = { ...prev };
                                    if (fid == null) delete next[it.extraction_id];
                                    else next[it.extraction_id] = fid;
                                    return next;
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
