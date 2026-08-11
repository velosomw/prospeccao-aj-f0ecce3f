import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertTriangle, BookOpen, ExternalLink, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase-any";
import { listLearningUploadStatuses, recordLearningUploadStatus, subscribeLearningUploadStatuses } from "@/utils/learningUploadStatus";
import {
  uploadLearningFile,
  extractTextFromFile,
  processWithAI,
  markExtractionAsLearning,
  waitForOcr,
  waitForProcessing,
} from "@/services/learningService";
import {
  DIP_FOLDERS,
  getDipFolderById,
  dipFolderSlug,
  ACCOUNT_CLASS_LABEL,
  type DipFolder,
} from "@/data/dipFolders";
import { buildPathInFolder, defaultFolderSegment, findFolderLocationForDip, getPathFolderSegment, matchDipFolderBySegment } from "@/utils/dipFolderPaths";
import { buildFolderNumbering, deriveAppliedDipIds } from "@/utils/dipFolderNumbering";


interface Props {
  prospeccaoId: string;
  companyId: string | null;
  defaultFolderId?: number;
  defaultFileName?: string;
  compact?: boolean;
  /** Máx. de arquivos por upload. 1 = modo corretivo 1:1 (ErrorFilesPanel); 5 = aba Aprendizado IA. */
  maxFiles?: number;
  /** Mês/Ano travados ao Prospeccao selecionado. Quando informados, o seletor vira chip read-only. */
  lockedYear?: number | null;
  lockedMonth?: number | null;
  /** Callback disparado quando o usuário (ou efeito) altera a pasta correspondente. */
  onFolderChange?: (folderId: number | null) => void;
}

interface RowState {
  file: string;
  status: "uploading" | "ocr" | "ai" | "done" | "error";
  message?: string;
  extractionId?: string;
  progress?: number;
  confidence?: number | null;
  folderId?: number;
  folderLabel?: string;
  previouslyAttempted?: boolean;
}

const PROCESSING_STATUSES = new Set(["uploading", "ocr", "ai"]);

/**
 * Painel de Aprendizado IA · upload manual de documentos relacionados às pastas de
 * leitura do DIP (60 pastas oficiais do OneDrive). O combo "Pasta correspondente"
 * é alimentado por `src/data/dipFolders.ts` e vincula o arquivo:
 *  - ao agente especializado (para extração);
 *  - à classificação contábil predominante (Ativo, Passivo, Receita, Despesa, Fiscal…),
 *    que será usada no carregamento do balancete após a extração.
 */
export default function LearningUploadPanel({ prospeccaoId, companyId, defaultFolderId, defaultFileName, compact, maxFiles = 1, lockedYear, lockedMonth, onFolderChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [busy, setBusy] = useState(false);
  // null = nenhuma pasta selecionada (campo em branco até o usuário escolher)
  const [folderId, setFolderId] = useState<number | null>(defaultFolderId ?? null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [detectedFolderLabel, setDetectedFolderLabel] = useState<string | null>(null);
  const [localStatuses, setLocalStatuses] = useState(() => listLearningUploadStatuses(prospeccaoId));
  // Lista de arquivos com erro da pasta selecionada (vw_training_pending) — orienta o lote.
  const [folderErrors, setFolderErrors] = useState<Array<{ extraction_id: string; file_name: string | null; path: string | null; status: string; final_confidence: number | null }>>([]);
  const [loadingFolderErrors, setLoadingFolderErrors] = useState(false);
  // Mês/Ano de referência (obrigatório no modo lote). Quando o Prospeccao fornece
  // `lockedYear/lockedMonth`, esses valores travam o seletor (sem possibilidade
  // de divergir da competência do DIP-Prospeccao selecionado).
  const now = new Date();
  const monthLocked = lockedYear != null && lockedMonth != null;
  const [refYear, setRefYear] = useState<number>(lockedYear ?? now.getFullYear());
  const [refMonth, setRefMonth] = useState<number>(lockedMonth ?? (now.getMonth() + 1));
  const refMonthKey = `${refYear}-${String(refMonth).padStart(2, "0")}`;
  const effectiveRefYear = monthLocked ? lockedYear! : refYear;
  const effectiveRefMonth = monthLocked ? lockedMonth! : refMonth;
  const effectiveRefMonthKey = `${effectiveRefYear}-${String(effectiveRefMonth).padStart(2, "0")}`;

  // Mantém refYear/refMonth sincronizados ao Prospeccao selecionado (travados).
  useEffect(() => {
    if (lockedYear != null) setRefYear(lockedYear);
    if (lockedMonth != null) setRefMonth(lockedMonth);
  }, [lockedYear, lockedMonth]);

  // Atualiza pasta quando defaultFolderId muda (ex: clique em outro arquivo com erro)
  useEffect(() => {
    if (defaultFolderId != null) setFolderId(defaultFolderId);
  }, [defaultFolderId]);

  // Notifica o pai sempre que a pasta selecionada mudar (para que o reprocessamento
  // disparado fora deste painel — ex: ErrorFilesPanel — use a pasta corrigida).
  useEffect(() => {
    onFolderChange?.(folderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);


  useEffect(() => {
    const refresh = () => setLocalStatuses(listLearningUploadStatuses(prospeccaoId));
    refresh();
    return subscribeLearningUploadStatuses(refresh);
  }, [prospeccaoId]);

  // Numeração unificada (OD / Arq) — mesma referência das abas Worker e Arquivos com erro.
  const [appliedDipIds, setAppliedDipIds] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!prospeccaoId) { setAppliedDipIds([]); return; }
      const rows: Array<{ path?: string | null; metadata?: Record<string, any> | null }> = [];
      for (let from = 0; from < 5000; from += 1000) {
        const { data } = await supabase
          .from("onedrive_files")
          .select("path, metadata")
          .eq("prospeccao_id", prospeccaoId)
          .range(from, from + 999);
        if (!data?.length) break;
        rows.push(...(data as any[]));
        if (data.length < 1000) break;
      }
      if (!cancelled) setAppliedDipIds(deriveAppliedDipIds(rows));
    })();
    return () => { cancelled = true; };
  }, [prospeccaoId]);
  const folderNumbering = useMemo(() => buildFolderNumbering(appliedDipIds), [appliedDipIds]);
  const formatOption = (f: DipFolder) => {
    const ref = folderNumbering.get(f.id);
    const od = String(f.id).padStart(2, "0");
    const arq = ref?.fileNumber ?? "—";
    return `OD ${od} · Arq ${arq} · ${f.label}`;
  };


  const selected: DipFolder | null = useMemo(
    () => (folderId == null ? null : getDipFolderById(folderId) ?? null),
    [folderId],
  );

  // Carrega arquivos com erro da pasta selecionada (apenas no modo lote).
  const loadFolderErrors = useCallback(async () => {
    if (maxFiles <= 1 || !prospeccaoId || !selected) {
      setFolderErrors([]);
      return;
    }
    setLoadingFolderErrors(true);
    try {
      const [pendingResult, processingResult] = await Promise.all([
        supabase
        .from("vw_training_pending")
        .select("extraction_id, file_name, path, status, final_confidence, agent")
        .eq("prospeccao_id", prospeccaoId)
        .limit(500),
        supabase
          .from("onedrive_files")
          .select("file_id, file_name, path, status")
          .eq("prospeccao_id", prospeccaoId)
          .eq("status", "processing")
          .limit(200),
      ]);
      const { data, error } = pendingResult;
      if (error) throw error;
      if (processingResult.error) throw processingResult.error;
      // Filtra por pasta: prefixo NN- no path OU agente da pasta selecionada
      const prefix = String(selected.id).padStart(2, "0");
      const isSelectedFolder = (d: any) => {
        const p = (d.path || "").toLowerCase();
        const byFolderName = matchDipFolderBySegment(getPathFolderSegment(d.path));
        if (byFolderName?.id === selected.id) return true;
        if (p.includes(`/${prefix}-`) || p.startsWith(`${prefix}-`)) return true;
        if (d.agent && d.agent === selected.agent) return true;
        return false;
      };
      const rank = (s: string) => (["processing", "queued", "pending"].includes(s) ? 3 : ["failed", "error"].includes(s) ? 2 : 1);
      const map = new Map<string, { extraction_id: string; file_name: string | null; path: string | null; status: string; final_confidence: number | null }>();
      const put = (d: { extraction_id: string; file_name: string | null; path: string | null; status: string; final_confidence: number | null }) => {
        const key = d.file_name?.toLowerCase() || d.path || d.extraction_id;
        const prev = map.get(key);
        if (!prev || rank(d.status) > rank(prev.status)) map.set(key, d);
      };
      (data ?? []).filter(isSelectedFolder).forEach((d: any) => put(d));
      ((processingResult.data ?? []) as any[]).filter(isSelectedFolder).forEach((p) => put({
        extraction_id: `proc:${p.file_id}`,
        file_name: p.file_name ?? null,
        path: p.path ?? null,
        status: "processing",
        final_confidence: null,
      }));
      localStatuses.filter((s) => s.folderId === selected.id).forEach((s) => {
        const key = s.fileName.toLowerCase();
        if (s.status === "done") {
          map.delete(key);
          return;
        }
        put({
          extraction_id: `local:${key}`,
          file_name: s.fileName,
          path: s.path ?? null,
          status: s.status === "processing" ? "processing" : "error",
          final_confidence: s.confidence ?? null,
        });
      });
      setFolderErrors(Array.from(map.values()));
    } catch (err) {
      console.warn("folder errors load failed:", err);
      setFolderErrors([]);
    } finally {
      setLoadingFolderErrors(false);
    }
  }, [maxFiles, prospeccaoId, selected, localStatuses]);

  useEffect(() => { loadFolderErrors(); }, [loadFolderErrors]);


  function update(idx: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  // Quando o usuário escolhe arquivos, NÃO processa: detecta a pasta atual
  // do arquivo (se existir em onedrive_files) e prefilla o combo. O usuário
  // pode manter ou alterar antes de clicar em "Processar".
  async function handleFileSelection(files: FileList | null) {
    if (!files?.length) return;
    // Concorrência permitida: novos uploads podem ser enfileirados enquanto
    // outros arquivos processam. Apenas bloqueamos durante o request HTTP ativo.
    if (busy) {
      toast({
        title: "Envio em andamento",
        description: "Aguarde o envio atual ser concluído (segundos). Em seguida você pode iniciar outro lote.",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    // Limita ao máximo permitido (1 para modo corretivo, 5 para Aprendizado IA).
    const all = Array.from(files);
    const list = all.slice(0, maxFiles);
    if (all.length > maxFiles) {
      toast({
        title: `Máximo de ${maxFiles} arquivo(s) por upload`,
        description: `Mantivemos os primeiros ${maxFiles}. Envie os demais em outro lote.`,
      });
    }
    setPendingFiles(list);
    setDetectedFolderLabel(null);
    try {
      const first = list[0];
      const { data } = await supabase
        .from("onedrive_files")
        .select("path, metadata")
        .eq("prospeccao_id", prospeccaoId)
        .ilike("file_name", first.name)
        .limit(1)
        .maybeSingle();
      if (data?.path) {
        const folderName = (data.path as string).split("/").slice(-2, -1)[0] ?? "";
        const match = matchDipFolderBySegment(folderName) || DIP_FOLDERS.find(
          (f) => f.label.toLowerCase() === folderName.toLowerCase() || dipFolderSlug(f) === folderName.toLowerCase(),
        );
        if (match) {
          setFolderId(match.id);
          setDetectedFolderLabel(match.label);
        } else if (folderName) {
          setDetectedFolderLabel(folderName);
        }
      }
    } catch (err) {
      console.warn("folder detection failed:", err);
    }
  }

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    if (!selected) {
      toast({ title: "Selecione a pasta", description: "Escolha a pasta correspondente antes de processar.", variant: "destructive" });
      return;
    }
    if (maxFiles > 1 && !refMonthKey) {
      toast({ title: "Selecione mês/ano de referência", description: "Defina o mês cujo DIP-Prospeccao AJ será atualizado por este lote.", variant: "destructive" });
      return;
    }
    const folder = selected;
    const slug = dipFolderSlug(folder);

    setBusy(true);

    let folderSegment = defaultFolderSegment(folder);
    let resolvedFolderPath = `manual-upload/${folderSegment}`;
    try {
      const folderRows: Array<{ path?: string | null; metadata?: Record<string, any> | null }> = [];
      for (let from = 0; from < 5000; from += 1000) {
        let folderQuery = supabase
          .from("onedrive_files")
          .select("path, metadata")
          .eq("prospeccao_id", prospeccaoId)
          .range(from, from + 999);
        if (companyId) folderQuery = folderQuery.eq("company_id", companyId);
        const { data } = await folderQuery;
        if (!data?.length) break;
        folderRows.push(...(data as any[]));
        if (data.length < 1000) break;
      }
      const location = findFolderLocationForDip(folderRows, folder);
      folderSegment = location.segment;
      resolvedFolderPath = location.folderPath;
    } catch (err) {
      console.warn("folder location lookup failed:", err);
    }

    // === Guarda de duplicidade ===
    // Antes de subir, checa se cada arquivo já está em fila de processamento
    // (onedrive_files.status ∈ processing/queued/pending). Se sim:
    //  - mesma pasta → bloqueia (não duplica na fila)
    //  - pasta diferente → move o registro existente para a pasta nova
    //    (mantendo o processamento) e descarta o reupload.
    // Segmento da pasta real do Worker (ex.: "01 - Fluxo de Caixa"), preservando a estrutura do OneDrive.
    // Status considerados "em fila/parado" — todos serão reativados pelo upload manual.
    const PROC = ["processing", "queued", "pending", "error", "failed", "manual_upload_required", "stalled"];
    let workFiles: File[] = files;
    const filtered: File[] = [];
    let skippedSame = 0;
    let moved = 0;
    let reactivated = 0;
    for (const f of workFiles) {
      try {
        const { data: matches } = await supabase
          .from("onedrive_files")
          .select("file_id, path, status, metadata, ano, mes")
          .eq("prospeccao_id", prospeccaoId)
          .ilike("file_name", f.name)
          .in("status", PROC)
          .limit(10);
        const rows = matches ?? [];
        if (rows.length === 0) { filtered.push(f); continue; }

        const ACTIVE = ["processing", "queued", "pending"];
        // 1) Se QUALQUER registro estiver ativo:
        //    - mesma pasta → bloqueia o reupload (não duplica)
        //    - pasta diferente → MOVE o registro existente para a pasta selecionada
        //      (preservando o processamento) para que apareça no Worker OneDrive
        //      na pasta correta. Não duplica e não bloqueia.
        const active = rows.find((r) => ACTIVE.includes(String(r.status)));
        if (active) {
          const activeFolderName = ((active.path || "").split("/").slice(-2, -1)[0] ?? "").toLowerCase();
          const activeFolder = matchDipFolderBySegment(activeFolderName);
          const isSameFolder =
            activeFolder?.id === folder.id ||
            activeFolderName === slug ||
            activeFolderName === folder.label.toLowerCase() ||
            activeFolderName === folderSegment.toLowerCase();
          if (isSameFolder) {
            skippedSame++;
            toast({
              title: `"${f.name}" já está em processamento`,
              description: `Já existe um envio em andamento na pasta "${activeFolderName || folder.label}" (status: ${active.status}). Aguarde concluir antes de reenviar.`,
              variant: "destructive",
            });
            continue;
          }
          // Pasta diferente: move o registro ativo para a pasta selecionada.
          const newFolderPath = buildPathInFolder(active.path, f.name, resolvedFolderPath, folderSegment);
          const prevMeta = (active.metadata as Record<string, unknown> | null) ?? {};
          await supabase
            .from("onedrive_files")
            .update({
              path: newFolderPath,
              error_message: null,
              last_learning_error: null,
              requires_manual_upload: false,
              ano: effectiveRefYear,
              mes: effectiveRefMonth,
              metadata: {
                ...prevMeta,
                corrected_folder_id: folder.id,
                corrected_folder_slug: slug,
                corrected_folder_label: folder.label,
                original_folder_slug: activeFolderName || null,
                corrected_at: new Date().toISOString(),
                moved_by_manual_upload: true,
                reference_month: effectiveRefMonthKey,
                reference_year: effectiveRefYear,
                reference_month_num: effectiveRefMonth,
              },
            })
            .eq("file_id", active.file_id);
          moved++;
          continue;
        }

        // 2) Nenhum ativo, mas há registro parado/erro → move/reativa o mais recente.
        const existing = rows[0];
        const currentFolderName = ((existing.path || "").split("/").slice(-2, -1)[0] ?? "").toLowerCase();
        const currentFolder = matchDipFolderBySegment(currentFolderName);
        const sameFolder =
          currentFolder?.id === folder.id ||
          currentFolderName === slug ||
          currentFolderName === folder.label.toLowerCase() ||
          currentFolderName === folderSegment.toLowerCase();
        const newFolderPath = buildPathInFolder(existing.path, f.name, resolvedFolderPath, folderSegment);
        const prevMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
        await supabase
          .from("onedrive_files")
          .update({
            path: newFolderPath,
            status: "queued",
            error_message: null,
            last_learning_error: null,
            requires_manual_upload: false,
            ano: effectiveRefYear,
            mes: effectiveRefMonth,
            metadata: {
              ...prevMeta,
              corrected_folder_id: folder.id,
              corrected_folder_slug: slug,
              corrected_folder_label: folder.label,
              original_folder_slug: currentFolderName || null,
              corrected_at: new Date().toISOString(),
              moved_by_manual_upload: true,
              reference_month: effectiveRefMonthKey,
              reference_year: effectiveRefYear,
              reference_month_num: effectiveRefMonth,
            },
          })
          .eq("file_id", existing.file_id);
        if (sameFolder) reactivated++; else moved++;
      } catch (err) {
        console.warn("duplicate guard failed for", f.name, err);
        filtered.push(f);
      }
    }

    if (skippedSame > 0) {
      toast({
        title: `${skippedSame} arquivo(s) já em processamento`,
        description: "Estes arquivos já estão na fila na mesma pasta — não foram reenviados para evitar duplicidade.",
      });
    }
    if (reactivated > 0) {
      toast({
        title: `${reactivated} arquivo(s) reativado(s)`,
        description: `Arquivos parados/com erro foram recolocados na fila em ${folder.label}.`,
      });
    }
    if (moved > 0) {
      toast({
        title: `${moved} arquivo(s) movido(s) para ${folder.label}`,
        description: "Pasta corrigida e processamento reiniciado.",
      });
    }

    if (!filtered.length) {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      setPendingFiles([]);
      loadFolderErrors();
      return;
    }
    workFiles = filtered;

    const fileNames = new Set(workFiles.map((f) => f.name));
    const previousNames = new Set(
      rows.filter((r) => r.status === "error" && fileNames.has(r.file)).map((r) => r.file),
    );
    const initial: RowState[] = workFiles.map((f) => ({
      file: f.name,
      status: "uploading" as const,
      progress: 0,
      folderId: folder.id,
      folderLabel: folder.label,
      previouslyAttempted: previousNames.has(f.name),
      message: previousNames.has(f.name) ? "Reenviando após falha anterior…" : undefined,
    }));
    // Remove linhas de erro anteriores dos mesmos arquivos (estão sendo reprocessados)
    // e adiciona as novas linhas no topo (final da fila visualmente = topo recente).
    setRows((prev) => [...initial, ...prev.filter((r) => !fileNames.has(r.file))].slice(0, 20));
    initial.forEach((r) => recordLearningUploadStatus({
      prospeccaoId,
      fileName: r.file,
      folderId: folder.id,
      folderLabel: folder.label,
      status: "processing",
      progress: 0,
      message: "Aguardando processamento",
    }));

    for (let i = 0; i < workFiles.length; i++) {
      const f = workFiles[i];
      try {
        update(i, { status: "uploading", progress: 5, message: "Enviando ao bucket…" });
        recordLearningUploadStatus({ prospeccaoId, fileName: f.name, folderId: folder.id, folderLabel: folder.label, status: "processing", progress: 5, message: "Enviando ao bucket…" });
        // Bloqueia o auto-sync/extração do OneDrive enquanto este arquivo é processado
        // manualmente — evita corrida e duplicidade na fila incremental.
        try {
          const processingPatch = {
            status: "processing",
            requires_manual_upload: false,
            last_learning_at: new Date().toISOString(),
            last_learning_error: null,
            ano: effectiveRefYear,
            mes: effectiveRefMonth,
          };
          // Procura QUALQUER registro existente desse arquivo no Prospeccao (em qualquer status)
          // para movê-lo à pasta selecionada — assim o Worker passa a exibi-lo na pasta certa.
          const { data: existingRows } = await supabase
            .from("onedrive_files")
            .select("file_id, path, metadata")
            .eq("prospeccao_id", prospeccaoId)
            .ilike("file_name", f.name)
            .order("updated_at", { ascending: false })
            .limit(5);
          const existing = (existingRows ?? [])[0];
          if (existing) {
            // Move o registro existente para a pasta canônica selecionada pelo usuário.
            const newPath = buildPathInFolder(existing.path, f.name, resolvedFolderPath, folderSegment);
            const prevFolder = ((existing.path || "").split("/").slice(-2, -1)[0] ?? "").toLowerCase();
            const prevMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
            await supabase
              .from("onedrive_files")
              .update({
                ...processingPatch,
                path: newPath,
                error_message: null,
                metadata: {
                  ...prevMeta,
                  manual_learning_upload: true,
                  corrected_folder_id: folder.id,
                  corrected_folder_slug: slug,
                  corrected_folder_label: folder.label,
                  original_folder_slug: prevFolder || null,
                  corrected_at: new Date().toISOString(),
                  moved_by_manual_upload: true,
                  reference_month: effectiveRefMonthKey,
                  reference_year: effectiveRefYear,
                  reference_month_num: effectiveRefMonth,
                },
              })
              .eq("file_id", existing.file_id);
          } else {
            // Não existe registro → cria novo, correlacionado a uma pasta real (mesmo slug
            // ou segmento canônico) para casar com o agrupamento do Worker OneDrive.
            const { error: upsertErr } = await supabase.from("onedrive_files").upsert({
              file_id: `manual:${prospeccaoId}:${crypto.randomUUID()}`,
              prospeccao_id: prospeccaoId,
              company_id: companyId,
              path: `${resolvedFolderPath}/${f.name}`,
              file_name: f.name,
              file_type: f.name.split(".").pop()?.toLowerCase() ?? null,
              mime_type: f.type || null,
              size_bytes: f.size,
              ...processingPatch,
              metadata: {
                manual_learning_upload: true,
                corrected_folder_id: folder.id,
                corrected_folder_slug: slug,
                corrected_folder_label: folder.label,
                correlated_folder_path: resolvedFolderPath,
                reference_month: effectiveRefMonthKey,
                reference_year: effectiveRefYear,
                reference_month_num: effectiveRefMonth,
              },
            });
            if (upsertErr) console.warn("manual upsert failed:", upsertErr);
          }
        } catch (err) {
          console.warn("processing flag failed:", err);
        }

        const up = await uploadLearningFile(f);

        update(i, { status: "ocr", progress: 20, message: "Extraindo texto (OCR)…" });
        recordLearningUploadStatus({ prospeccaoId, fileName: f.name, path: `${slug}/${up.path}`, folderId: folder.id, folderLabel: folder.label, status: "processing", progress: 20, message: "Extraindo texto (OCR)…" });
        let extracted = await extractTextFromFile(f, up);
        if (extracted.asyncOcrId) {
          const done = await waitForOcr(extracted.asyncOcrId, (s) => {
            update(i, { status: "ocr", progress: Math.max(20, Math.min(55, s.progress ?? 20)), message: `OCR em processamento · ${s.progress ?? 0}%` });
            recordLearningUploadStatus({ prospeccaoId, fileName: f.name, path: `${slug}/${up.path}`, folderId: folder.id, folderLabel: folder.label, status: "processing", progress: Math.max(20, Math.min(55, s.progress ?? 20)), message: `OCR em processamento · ${s.progress ?? 0}%` });
          });
          extracted = {
            ...extracted,
            rawText: done.rawText,
            normalizedText: done.normalizedText,
            ocrConfidence: done.confidence,
            pageCount: done.pageCount,
          };
        }

        if (!extracted.rawText || extracted.rawText.length < 20) {
          update(i, { status: "error", progress: 100, confidence: extracted.ocrConfidence, message: "Processamento parcial: texto extraído insuficiente. Reenvie arquivo mais legível." });
          recordLearningUploadStatus({ prospeccaoId, fileName: f.name, path: `${slug}/${up.path}`, folderId: folder.id, folderLabel: folder.label, status: "error", progress: 100, confidence: extracted.ocrConfidence, message: "Processamento parcial: texto extraído insuficiente. Reenvie arquivo mais legível." });
          try {
            await supabase
              .from("onedrive_files")
              .update({ status: "error", last_learning_error: "Texto extraído insuficiente", last_learning_at: new Date().toISOString() })
              .eq("prospeccao_id", prospeccaoId)
              .ilike("file_name", f.name);
          } catch {}
          continue;
        }

        update(i, { status: "ai", progress: 60, message: `Processando com ${folder.agent}…` });
        recordLearningUploadStatus({ prospeccaoId, fileName: f.name, path: `${slug}/${up.path}`, folderId: folder.id, folderLabel: folder.label, status: "processing", progress: 60, confidence: extracted.ocrConfidence, message: `Processando com ${folder.agent}…` });
        const ai = await processWithAI({
          rawText: extracted.rawText,
          normalizedText: extracted.normalizedText,
          path:
            `learning-docs/${slug}/${up.path} · prospeccao:${prospeccaoId}` +
            (companyId ? ` · company:${companyId}` : "") +
            ` · folder:${slug} · folderId:${folder.id} · agent:${folder.agent}` +
            ` · accountClass:${folder.accountClass}` +
            ` · refMonth:${effectiveRefMonthKey} · refYear:${effectiveRefYear} · refMonthNum:${effectiveRefMonth}`,
          ocrConfidence: extracted.ocrConfidence,
        });
        const extractionId = (ai as any).id;
        let finalConfidence = (ai as any).final_conf ?? null;
        if ((ai as any).status === "pending" && extractionId) {
          const done = await waitForProcessing(extractionId, (s) => {
            const p = Math.max(60, Math.min(99, s.progress ?? 60));
            update(i, { status: "ai", progress: p, message: `Processando com ${folder.agent} · ${p}%` });
            recordLearningUploadStatus({ prospeccaoId, fileName: f.name, path: `${slug}/${up.path}`, folderId: folder.id, folderLabel: folder.label, status: "processing", progress: p, confidence: s.final_conf ?? null, message: `Processando com ${folder.agent} · ${p}%` });
          });
          if (done.status !== "completed") {
            const pct = done.final_conf != null ? ` · confiança ${Math.round(done.final_conf * 100)}%` : "";
            throw new Error(done.error_message || `Processamento não concluído (${done.status})${pct}`);
          }
          finalConfidence = done.final_conf ?? finalConfidence;
        }
        if (extractionId) {
          await markExtractionAsLearning(extractionId, {
            path: `${slug}/${up.path}`,
            mimeType: up.mimeType,
            fileName: up.fileName,
            folderId: folder.id,
            folder: slug,
            folderLabel: folder.label,
            agentKey: folder.agent,
            accountClass: folder.accountClass,
          } as any);
        }

        // === Reclassificação de pasta ===
        try {
          const { data: candidates } = await supabase
            .from("onedrive_files")
            .select("file_id, path, metadata")
            .eq("prospeccao_id", prospeccaoId)
            .ilike("file_name", f.name)
            .limit(5);
          for (const c of candidates ?? []) {
            const prevMeta = (c.metadata as Record<string, unknown> | null) ?? {};
            const oldFolder = (c.path || "").split("/").slice(-2, -1)[0] ?? null;
            await supabase
              .from("onedrive_files")
              .update({
                requires_manual_upload: false,
                last_learning_error: null,
                last_learning_at: new Date().toISOString(),
                last_processed_at: new Date().toISOString(),
                status: "manual_uploaded",
                metadata: {
                  ...prevMeta,
                  corrected_folder_id: folder.id,
                  corrected_folder_slug: slug,
                  corrected_folder_label: folder.label,
                  original_folder_slug: oldFolder,
                  learning_extraction_id: extractionId ?? null,
                  corrected_at: new Date().toISOString(),
                  reference_month: effectiveRefMonthKey,
                  reference_year: effectiveRefYear,
                  reference_month_num: effectiveRefMonth,
                },
              })
              .eq("file_id", c.file_id);
          }
        } catch (err) {
          console.warn("folder reclassification failed:", err);
        }

        update(i, {
          status: "done",
          progress: 100,
          confidence: finalConfidence,
          message: `Pronto · ${folder.label}`,
          extractionId,
        });
        recordLearningUploadStatus({ prospeccaoId, fileName: f.name, path: `${slug}/${up.path}`, folderId: folder.id, folderLabel: folder.label, status: "done", progress: 100, confidence: finalConfidence, message: `Pronto · ${folder.label}` });
      } catch (e: any) {
        const raw = e?.message || String(e) || "Falha";
        const isCredit =
          /credit_limit_reached|workspace credit limit/i.test(raw) ||
          (/\b(402|403)\b/.test(raw) && /credit|limit/i.test(raw));
        const isRate = /\b429\b|rate.?limit/i.test(raw);
        const friendly = isCredit
          ? "Limite de créditos IA atingido — contate o gestor do workspace (Settings → Plans & credits)."
          : isRate
          ? "Limite de requisições IA atingido — aguarde alguns segundos e tente novamente."
          : raw;
        update(i, { status: "error", progress: 100, message: friendly });
        recordLearningUploadStatus({ prospeccaoId, fileName: f.name, folderId: folder.id, folderLabel: folder.label, status: "error", progress: 100, message: friendly });
        // Reverte a flag de "processing" para "error" no OneDrive — assim o arquivo
        // volta a aparecer na lista de erros e pode ser reenviado pelo usuário.
        try {
          await supabase
            .from("onedrive_files")
            .update({ status: "error", last_learning_error: friendly })
            .eq("prospeccao_id", prospeccaoId)
            .ilike("file_name", f.name);
        } catch {}
        if (isCredit) {
          toast({
            title: "Limite de créditos IA atingido",
            description:
              "O workspace bateu o limite do AI Gateway. Peça ao gestor para liberar créditos em Settings → Plans & credits e reprocesse o arquivo.",
            variant: "destructive",
          });
        }
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    setPendingFiles([]);
    setDetectedFolderLabel(null);
    setRows((curr) => {
      const ok = curr.filter((r) => r.status === "done").length;
      const ko = curr.filter((r) => r.status === "error").length;
      if (ok > 0 && ko === 0) {
        toast({ title: "Upload concluído", description: `${ok} arquivo(s) enviados ao aprendizado · pasta ${folder.label}.` });
      } else if (ok > 0 && ko > 0) {
        toast({ title: "Upload parcial", description: `${ok} ok · ${ko} falharam (veja a tag vermelha de cada linha).`, variant: "destructive" });
      } else if (ko > 0) {
        toast({ title: "Falha no upload", description: `Nenhum arquivo foi processado. ${curr.find((r) => r.status === "error")?.message ?? ""}`, variant: "destructive" });
      }
      // Remove os concluídos com sucesso da lista; mantém erros para reenvio
      // (e marca como previouslyAttempted para o usuário saber que já tentou).
      return curr
        .filter((r) => r.status !== "done")
        .map((r) => (r.status === "error" ? { ...r, previouslyAttempted: true } : r));
    });
    // Atualiza a lista de arquivos com erro da pasta — os que foram corrigidos somem.
    loadFolderErrors();
  }





  const statusBadge = (r: RowState) => {
    switch (r.status) {
      case "uploading":
      case "ocr":
      case "ai":
        return (
          <Badge className="bg-blue-600 text-white gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processando{r.progress != null ? ` · ${Math.round(r.progress)}%` : ""}
          </Badge>
        );
      case "done":
        return (
          <Badge className="bg-emerald-600 text-white gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Pronto{r.confidence != null ? ` · ${Math.round(r.confidence * 100)}%` : ""}
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-rose-600 text-white gap-1">
            <AlertTriangle className="h-3 w-3" />
            Falhou
          </Badge>
        );
    }
  };

  return (
    <div className="bg-white border border-border rounded-lg p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500 text-white flex items-center justify-center">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Aprendizado IA · Upload Manual</h3>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            variant="outline"
            className="border-amber-400 text-amber-700 hover:bg-amber-50"
          >
            <Upload className="h-4 w-4 mr-2" />
            Selecionar arquivos
          </Button>
          <Button
            onClick={() => handleFiles(pendingFiles)}
            disabled={busy || pendingFiles.length === 0 || !selected}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Processar {pendingFiles.length > 0 ? `(${pendingFiles.length})` : ""}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple={maxFiles > 1}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.xls,.xlsm"
            className="hidden"
            onChange={(e) => { handleFileSelection(e.target.files); }}
          />
        </div>
      </div>





      {/* Combo Pasta correspondente — alimentado pela lista oficial das 60 pastas DIP */}
      <div className="mb-4 grid gap-2 bg-amber-50/60 border border-amber-200 rounded-md p-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label className="text-xs font-semibold text-amber-900 whitespace-nowrap">
            Pasta correspondente (OneDrive · DIP):
          </label>
          <select
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value === "" ? null : Number(e.target.value))}
            disabled={busy}
            className="flex-1 h-9 text-sm rounded-md border border-amber-300 bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">— selecione a pasta correspondente —</option>
            {DIP_FOLDERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        {maxFiles > 1 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-xs font-semibold text-amber-900 whitespace-nowrap">
              Mês/Ano de referência (DIP-Prospeccao a atualizar):
            </label>
            {monthLocked ? (
              <span
                className="h-9 inline-flex items-center px-3 rounded-md border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-900"
                title="Mês/Ano travados ao Prospeccao AJ selecionado"
              >
                {String(effectiveRefMonth).padStart(2, "0")}/{effectiveRefYear}
                <span className="ml-2 text-[10px] font-normal text-amber-700">(Prospeccao AJ)</span>
              </span>
            ) : (
              <>
                <select
                  value={refMonth}
                  onChange={(e) => setRefMonth(Number(e.target.value))}
                  disabled={busy}
                  className="h-9 text-sm rounded-md border border-amber-300 bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m, i) => (
                    <option key={i+1} value={i+1}>{String(i+1).padStart(2,"0")} · {m}</option>
                  ))}
                </select>
                <select
                  value={refYear}
                  onChange={(e) => setRefYear(Number(e.target.value))}
                  disabled={busy}
                  className="h-9 text-sm rounded-md border border-amber-300 bg-white px-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {Array.from({ length: 6 }, (_, k) => now.getFullYear() - 3 + k).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </>
            )}
            <Badge className="bg-amber-500 text-white text-[10px]">Lote de até {maxFiles} arquivos · {effectiveRefMonthKey}</Badge>
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div className="bg-white border-2 border-amber-400 rounded-lg p-3 shadow-sm space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-amber-900">
                {pendingFiles.length} arquivo(s) selecionado(s) · máx {maxFiles}
                {detectedFolderLabel && (
                  <span className="ml-1 font-normal">· pasta atual: <strong>{detectedFolderLabel}</strong> (mantenha ou altere acima)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-500 text-white text-[10px]">Pronto p/ processar</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => { setPendingFiles([]); setDetectedFolderLabel(null); if (inputRef.current) inputRef.current.value = ""; }}
                  className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-100"
                  title="Remover seleção"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-amber-100 border border-amber-200 rounded-md">
              {pendingFiles.map((f, idx) => {
                const fname = f.name.toLowerCase();
                const matchesError = folderErrors.some((d) => (d.file_name ?? "").toLowerCase() === fname);
                const matchesDefault = !!defaultFileName && defaultFileName.toLowerCase() === fname;
                const nameMatches = matchesError || matchesDefault;
                return (
                  <li key={`${f.name}-${idx}`} className="flex items-center gap-3 p-2">
                    <div className="w-8 h-8 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-amber-900 truncate flex items-center gap-2" title={f.name}>
                        <span className="truncate">{f.name}</span>
                        {nameMatches && (
                          <Badge className="bg-emerald-600 text-white text-[10px] gap-1 shrink-0">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Nome Corresponde
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-amber-800">
                        {(f.size / 1024).toFixed(1)} KB · {f.type || "—"}
                        {matchesDefault && <span className="ml-1">· corresponde a <strong>{defaultFileName}</strong></span>}
                      </div>
                    </div>
                    {maxFiles > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-100"
                        title="Remover este arquivo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {selected ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-amber-900">
            <Badge variant="outline" className="bg-white border-amber-300">
              Pasta OneDrive: <strong className="ml-1">#{String(selected.id).padStart(2, "0")}</strong>
            </Badge>
            <Badge variant="outline" className="bg-white border-amber-300">
              Tópico Prospeccao: <strong className="ml-1">#{selected.prospeccaoTopicNumber}</strong>
            </Badge>
            <Badge variant="outline" className="bg-white border-amber-300">
              Agente: <strong className="ml-1">{selected.agent}</strong>
            </Badge>
            <Badge variant="outline" className="bg-white border-amber-300">
              Classificação contábil: <strong className="ml-1">{ACCOUNT_CLASS_LABEL[selected.accountClass]}</strong>
            </Badge>
          </div>
        ) : (
          <div className="text-[11px] text-amber-800">
            Selecione o arquivo e escolha a pasta correspondente antes de processar.
          </div>
        )}
      </div>

      {/* Arquivos com erro da pasta selecionada — orienta o lote (modo Aprendizado IA) */}
      {maxFiles > 1 && selected && (
        <div className="mb-4 border border-rose-200 bg-rose-50/40 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              Arquivos com erro nesta pasta · {selected.label}
              <Badge variant="destructive" className="text-[10px]">
                {loadingFolderErrors ? "…" : folderErrors.length}
              </Badge>
            </div>
            <Button size="sm" variant="ghost" onClick={loadFolderErrors} disabled={loadingFolderErrors} className="h-7 text-xs">
              {loadingFolderErrors ? <Loader2 className="h-3 w-3 animate-spin" /> : "Atualizar"}
            </Button>
          </div>
          {folderErrors.length === 0 ? (
            <div className="text-[11px] text-rose-800">
              {loadingFolderErrors ? "Carregando…" : "Nenhum arquivo com erro nesta pasta. 🎉"}
            </div>
          ) : (
            <>
              <div className="text-[11px] text-rose-800 mb-2">
                Selecione até <strong>{maxFiles}</strong> arquivos correspondentes. Os corrigidos somem desta lista após o processamento; repita o lote para os restantes.
              </div>
              <ul className="divide-y divide-rose-100 border border-rose-200 rounded-md bg-white max-h-56 overflow-auto">
                {folderErrors.map((d) => {
                  const fname = (d.file_name ?? "").toLowerCase();
                  const matched = pendingFiles.some((pf) => pf.name.toLowerCase() === fname);
                  const processingRow = rows.find(
                    (r) => r.file.toLowerCase() === fname && (r.status === "uploading" || r.status === "ocr" || r.status === "ai"),
                  );
                  const doneRow = rows.find((r) => r.file.toLowerCase() === fname && r.status === "done");
                  const isProcessing = !!processingRow || ["processing", "queued", "pending"].includes(d.status);
                  const isError = ["failed", "error"].includes(d.status);
                  const pct = d.final_confidence != null ? `${Math.round(d.final_confidence * 100)}%` : null;
                  return (
                    <li key={d.extraction_id} className={`flex items-center gap-2 p-2 text-xs ${isProcessing ? "bg-blue-50" : matched ? "bg-emerald-50" : ""}`}>
                      <FileText className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" title={d.file_name ?? ""}>
                          {d.file_name ?? d.path ?? d.extraction_id.slice(0, 8)}
                        </div>
                        {d.path && <div className="text-[10px] text-muted-foreground truncate">{d.path}</div>}
                      </div>
                      {isProcessing ? (
                        <Badge className="bg-blue-600 text-white text-[10px] gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          Processando{processingRow?.progress != null ? ` · ${Math.round(processingRow.progress)}%` : ""}
                        </Badge>
                      ) : doneRow ? (
                        <Badge className="bg-emerald-600 text-white text-[10px]">Processado</Badge>
                      ) : matched ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Nome Corresponde
                        </Badge>
                      ) : isError ? (
                        <div className="flex items-center gap-1">
                          {pct && <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700">{pct}</Badge>}
                          <Badge variant="destructive" className="text-[10px]">Reenviar</Badge>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700">
                          {pct ?? d.status}
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}



      {rows.length === 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition"
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Arraste arquivos aqui ou clique para selecionar (PDF, imagem, planilha, texto).
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between border border-border rounded px-3 py-2 text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  <span className="truncate">{r.file}</span>
                  {r.previouslyAttempted && r.status === "error" && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-amber-400 text-amber-700">
                      já enviado anteriormente
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                  {r.folderId != null && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                      {String(r.folderId).padStart(2, "0")} · {r.folderLabel}
                    </Badge>
                  )}
                  {r.message && <span className="truncate">{r.message}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {statusBadge(r)}
                {r.status === "error" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                    className="h-7 text-xs"
                  >
                    Reenviar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
