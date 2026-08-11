import { Fragment, useEffect, useMemo, useState } from "react";
import { Folder, FolderOpen, RefreshCw, CheckCircle2, AlertCircle, Clock, RotateCw, FileWarning, Move, PauseCircle, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DIP_FOLDERS, dipFolderSlug } from "@/data/dipFolders";
import { toast } from "sonner";
import { buildFolderAliasMap, buildPathInFolder, findFolderLocationForDip, getPathDirectory, getPathFolderSegment, matchDipFolderBySegment, normalizeFolderText } from "@/utils/dipFolderPaths";
import { buildFolderNumbering } from "@/utils/dipFolderNumbering";

// Noprospeccaoliza um texto (lowercase, sem acentos, sem caracteres especiais)
// para comparação fuzzy de labels de pasta entre OneDrive e DIP_FOLDERS.
const normalize = (s: string) =>
  normalizeFolderText(s);

// Pega as palavras "fortes" (≥4 letras) do label canônico para fuzzy match.
const keyWords = (label: string) =>
  normalize(label)
    .split(" ")
    .filter((w) => w.length >= 4);

interface Props {
  companyId: string | null;
  /** Filtro por competência (vem do CompetenciaSelector do Prospeccao). */
  ano?: number | null;
  mes?: number | null;
  /** Quando true, o seletor de mês é travado ao mês do Prospeccao vinculado. */
  lockMonth?: boolean;
}

interface FileRow {
  file_id?: string | null;
  path: string;
  file_name?: string | null;
  status: string | null;
  last_processed_at: string | null;
  ano: number | null;
  mes: number | null;
  reprocess_count?: number | null;
  metadata?: Record<string, any> | null;
}

const resolveRowMonthKey = (row: FileRow): string | null => {
  const path = row.path || "";
  const byPath = path.match(/(?:^|\/)(0?[1-9]|1[0-2])\.(20\d{2})(?:\/|$)/);
  if (byPath) return `${byPath[2]}-${String(Number(byPath[1])).padStart(2, "0")}`;
  const metaMonth = row.metadata?.reference_month;
  if (typeof metaMonth === "string" && /^\d{4}-\d{2}$/.test(metaMonth)) return metaMonth;
  if (row.ano && row.mes) return `${row.ano}-${String(row.mes).padStart(2, "0")}`;
  return null;
};

interface FolderAgg {
  folder: string;
  files: number;
  processed: number;
  failed: number;
  pending: number;
  reprocess: number;
  pct: number;
  /** True quando a pasta vem da lista canônica DIP e ainda não tem arquivos. */
  missing?: boolean;
  canonicalLabel?: string;
  /** ID DIP canônico, quando identificado — usado para numeração unificada nas abas. */
  dipId?: number;
}

const pctColor = (p: number) =>
  p >= 67
    ? "bg-[hsl(142,76%,36%)]"
    : p >= 33
    ? "bg-[hsl(38,92%,50%)]"
    : "bg-[hsl(0,84%,60%)]";

export default function OneDriveFoldersStatus({ companyId, ano, mes, lockMonth = false }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "complete" | "partial" | "empty">("all");
  // Quando o usuário não selecionar manualmente, segue o `ano/mes` da prop.
  const [monthOverride, setMonthOverride] = useState<string | "all" | "auto">("auto");
  // Pasta expandida (mostra arquivos)
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  // Arquivo selecionado (para destacar visualmente durante upload manual)
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // Pasta destino escolhida no seletor por arquivo (key = file_id ou path)
  const [moveTarget, setMoveTarget] = useState<Record<string, number>>({});
  // Confirmacaoção em 2 etapas para exclusão
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Ações em curso (para desabilitar botões)
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const all: FileRow[] = [];
    for (let from = 0; from < 5000; from += 1000) {
      // Tentamos selecionar reprocess_count; se a coluna não existir, refazemos sem ela.
      let q: any = supabase
        .from("onedrive_files")
        .select("file_id,path,file_name,status,last_processed_at,ano,mes,reprocess_count,metadata")
        .eq("company_id", companyId)
        .range(from, from + 999);
      let { data, error } = await q;
      if (error) {
        // Fallback se reprocess_count não existir no schema
        const r2 = await supabase
          .from("onedrive_files")
          .select("file_id,path,file_name,status,last_processed_at,ano,mes,metadata")
          .eq("company_id", companyId)
          .range(from, from + 999);
        data = r2.data as any;
        error = r2.error;
        if (error) break;
      }
      if (!data?.length) break;
      all.push(...(data as FileRow[]));
      if (data.length < 1000) break;
    }
    setRows(all);
    setLoading(false);
  };

  const fileKey = (r: FileRow) => r.file_id || r.path;

  // Move o arquivo para outra pasta DIP — apenas no banco da plataforma (path + metadata).
  // Não toca no OneDrive.
  const moveFile = async (r: FileRow, targetId: number) => {
    if (!r.file_id) { toast.error("Arquivo sem file_id; não é possível mover."); return; }
    const target = DIP_FOLDERS.find((f) => f.id === targetId);
    if (!target) return;
    const key = fileKey(r);
    setBusyKey(key);
    try {
      const parts = (r.path || "").split("/");
      const fileName = r.file_name || parts[parts.length - 1] || "arquivo";
      const newSlug = dipFolderSlug(target);
      const targetLocation = findFolderLocationForDip(
        rows.filter((row) => fileKey(row) !== key && row.ano === r.ano && row.mes === r.mes),
        target,
      );
      const newPath = buildPathInFolder(r.path, fileName, targetLocation.folderPath, targetLocation.segment);
      const prevFolder = parts.length > 1 ? parts[parts.length - 2] : null;
      const prevMeta = (r.metadata as Record<string, any> | null) ?? {};
      const { error } = await supabase
        .from("onedrive_files")
        .update({
          path: newPath,
          metadata: {
            ...prevMeta,
            corrected_folder_id: target.id,
            corrected_folder_slug: newSlug,
            corrected_folder_label: target.label,
            corrected_folder_segment: targetLocation.segment,
            original_folder_slug: prevFolder,
            corrected_at: new Date().toISOString(),
            moved_in_platform: true,
          },
        })
        .eq("file_id", r.file_id);
      if (error) throw error;
      toast.success(`Arquivo movido para "${target.label}".`);
      setMoveTarget((s) => { const n = { ...s }; delete n[key]; return n; });
      setSelectedFile(null);
      await load();
    } catch (e: any) {
      toast.error(`Falha ao mover: ${e.message ?? e}`);
    } finally { setBusyKey(null); }
  };

  // Marca arquivo como "Validar" — suspende uso dos dados extraídos e não contabiliza no mês.
  const markUnderReview = async (r: FileRow) => {
    if (!r.file_id) { toast.error("Arquivo sem file_id; não é possível marcar."); return; }
    const key = fileKey(r);
    setBusyKey(key);
    try {
      const prevMeta = (r.metadata as Record<string, any> | null) ?? {};
      const { error } = await supabase
        .from("onedrive_files")
        .update({
          status: "under_review",
          metadata: {
            ...prevMeta,
            under_review: true,
            under_review_at: new Date().toISOString(),
            suspend_extracted_data: true,
          },
        })
        .eq("file_id", r.file_id);
      if (error) throw error;
      toast.success("Arquivo marcado para validação. Dados extraídos suspensos.");
      await load();
    } catch (e: any) {
      toast.error(`Falha: ${e.message ?? e}`);
    } finally { setBusyKey(null); }
  };

  const deleteFile = async (r: FileRow) => {
    if (!r.file_id) { toast.error("Arquivo sem file_id; não é possível excluir."); return; }
    const key = fileKey(r);
    setBusyKey(key);
    try {
      const { error } = await supabase
        .from("onedrive_files")
        .delete()
        .eq("file_id", r.file_id);
      if (error) throw error;
      toast.success("Arquivo excluído da plataforma.");
      setPendingDelete(null);
      setSelectedFile(null);
      await load();
    } catch (e: any) {
      toast.error(`Falha ao excluir: ${e.message ?? e}`);
    } finally { setBusyKey(null); }
  };

  useEffect(() => {
    if (open && companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId]);

  // Reset override quando muda o Prospeccao/competência ativa.
  useEffect(() => {
    setMonthOverride("auto");
  }, [companyId, ano, mes]);

  // Meses disponíveis (para o seletor)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const key = resolveRowMonthKey(r);
      if (key) set.add(key);
    }
    return Array.from(set).sort().reverse();
  }, [rows]);

  // Determina filtro de mês efetivo. Se `lockMonth=true`, ignora override do usuário
  // e usa SEMPRE o ano/mes do Prospeccao vinculado (não permite seleção divergente).
  const effectiveMonth: string | "all" = useMemo(() => {
    if (lockMonth && ano && mes) return `${ano}-${String(mes).padStart(2, "0")}`;
    if (monthOverride !== "auto") return monthOverride;
    if (ano && mes) return `${ano}-${String(mes).padStart(2, "0")}`;
    return "all";
  }, [lockMonth, monthOverride, ano, mes]);

  const monthFilteredRows = useMemo(() => {
    if (effectiveMonth === "all") return rows;
    return rows.filter((r) => resolveRowMonthKey(r) === effectiveMonth);
  }, [rows, effectiveMonth]);

  const folderAliases = useMemo(() => buildFolderAliasMap(monthFilteredRows), [monthFilteredRows]);

  // Extrai o "nome curto" da pasta (último segmento do path do diretório),
  // ex.: "Projeto Prospeccao/DIPLOMATA/2025/11.2025/01 - Fluxo de Caixa" → "01 - Fluxo de Caixa".
  // Usado como CHAVE de agrupamento para que variações de prefixo
  // ("Projeto Prospeccao/..." vs "DIPLOMATA/...") sejam consolidadas em UMA única pasta.
  const folderKey = (path: string): { key: string; full: string } => {
    const dir = getPathDirectory(path) || "/";
    const last = getPathFolderSegment(path) || dir;
    return { key: folderAliases.get(last) || last, full: dir };
  };

  const folders: FolderAgg[] = useMemo(() => {
    const map = new Map<string, FolderAgg & { sample: string }>();
    for (const r of monthFilteredRows) {
      const { key, full } = folderKey(r.path || "");
      const cur = map.get(key) || { folder: key, sample: full, files: 0, processed: 0, failed: 0, pending: 0, reprocess: 0, pct: 0 };
      if ((cur.sample || "").toLowerCase().startsWith("manual-upload/") && !full.toLowerCase().startsWith("manual-upload/")) {
        cur.sample = full;
      }
      cur.files += 1;
      const st = (r.status || "").toLowerCase();
      if (r.last_processed_at) cur.processed += 1;
      else if (st.includes("fail") || st.includes("error") || st === "manual_upload_required") cur.failed += 1;
      else cur.pending += 1;
      if ((r.reprocess_count ?? 0) > 0) cur.reprocess += 1;
      if (cur.dipId == null) {
        const dip =
          matchDipFolderBySegment(key) ||
          matchDipFolderBySegment(r.metadata?.corrected_folder_label) ||
          matchDipFolderBySegment(r.metadata?.topic_folder);
        if (dip) cur.dipId = dip.id;
      }
      map.set(key, cur);
    }
    const arr: FolderAgg[] = Array.from(map.values()).map((f) => ({
      ...f,
      pct: f.files ? Math.round((f.processed / f.files) * 100) : 0,
    }));

    // ── Mescla com a lista canônica DIP_FOLDERS (60 pastas esperadas).
    const actualNorm = arr.map((f) => normalize(f.folder));
    for (const dip of DIP_FOLDERS) {
      const kws = keyWords(dip.label);
      if (kws.length === 0) continue;
      const matched = actualNorm.some((n) => kws.every((w) => n.includes(w)));
      if (matched) continue;
      arr.push({
        folder: `${String(dip.id).padStart(2, "0")} - ${dip.label}`,
        canonicalLabel: dip.label,
        files: 0,
        processed: 0,
        failed: 0,
        pending: 0,
        reprocess: 0,
        pct: 0,
        missing: true,
        dipId: dip.id,
      });
    }

    arr.sort((a, b) => {
      if (!!a.missing !== !!b.missing) return a.missing ? 1 : -1;
      const na = a.dipId ?? parseInt(a.folder.match(/^(\d+)/)?.[1] || "999", 10);
      const nb = b.dipId ?? parseInt(b.folder.match(/^(\d+)/)?.[1] || "999", 10);
      if (na !== nb) return na - nb;
      return a.folder.localeCompare(b.folder);
    });
    return arr;
  }, [monthFilteredRows]);

  // Numeração unificada (Nº OneDrive / Nº Arquivo) baseada nas pastas REAIS aplicadas neste Prospeccao.
  const folderNumbering = useMemo(
    () => buildFolderNumbering(folders.filter((f) => !f.missing && f.dipId != null).map((f) => f.dipId!)),
    [folders],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return folders;
    if (filter === "complete") return folders.filter((f) => f.pct === 100);
    if (filter === "empty") return folders.filter((f) => f.files === 0 || f.pct === 0);
    return folders.filter((f) => f.pct > 0 && f.pct < 100);
  }, [folders, filter]);

  const summary = useMemo(() => {
    const totalFolders = folders.length;
    const completeFolders = folders.filter((f) => f.pct === 100).length;
    const totalFiles = folders.reduce((s, f) => s + f.files, 0);
    const processed = folders.reduce((s, f) => s + f.processed, 0);
    const failed = folders.reduce((s, f) => s + f.failed, 0);
    const pending = folders.reduce((s, f) => s + f.pending, 0);
    const reprocess = folders.reduce((s, f) => s + f.reprocess, 0);
    const pct = totalFiles ? Math.round((processed / totalFiles) * 100) : 0;
    return { totalFolders, completeFolders, totalFiles, processed, failed, pending, reprocess, pct };
  }, [folders]);

  const monthLabel = (mk: string) => {
    const [y, m] = mk.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  };

  return (
    <div className="bg-white border border-border rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          {open ? <FolderOpen className="w-4 h-4 text-[hsl(217,91%,50%)]" /> : <Folder className="w-4 h-4 text-[hsl(217,91%,50%)]" />}
          <span className="text-sm font-bold text-foreground">
            Pastas OneDrive — Status de Leitura
          </span>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground ml-2">
              {summary.totalFolders} pastas • {summary.processed}/{summary.totalFiles} arquivos lidos ({summary.pct}%)
              {effectiveMonth !== "all" && (
                <> • <span className="font-semibold text-foreground">{monthLabel(effectiveMonth)}</span></>
              )}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{open ? "Recolher" : "Expandir"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* Seletor de mês + filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] uppercase font-semibold text-muted-foreground">Mês:</label>
            {lockMonth ? (
              <span
                className="text-xs px-2 py-1 rounded border border-border bg-[hsl(220,15%,96%)] text-foreground font-semibold"
                title="Mês travado ao Prospeccao AJ vinculado"
              >
                {effectiveMonth === "all" ? "Prospeccao sem competência definida" : monthLabel(effectiveMonth)}
                <span className="ml-2 text-[10px] text-muted-foreground font-normal">(Prospeccao AJ)</span>
              </span>
            ) : (
              <select
                value={effectiveMonth}
                onChange={(e) => setMonthOverride(e.target.value as any)}
                className="text-xs px-2 py-1 rounded border border-border bg-white text-foreground"
              >
                <option value="all">Todos os meses</option>
                {availableMonths.map((mk) => (
                  <option key={mk} value={mk}>{monthLabel(mk)}</option>
                ))}
              </select>
            )}

            <div className="w-px h-5 bg-border mx-1" />

            <button
              onClick={() => setFilter("all")}
              className={`text-xs px-2.5 py-1 rounded border ${filter === "all" ? "bg-[hsl(217,91%,50%)] text-white border-transparent" : "bg-white text-muted-foreground border-border"}`}
            >
              Todas ({folders.length})
            </button>
            <button
              onClick={() => setFilter("complete")}
              className={`text-xs px-2.5 py-1 rounded border ${filter === "complete" ? "bg-[hsl(217,91%,50%)] text-white border-transparent" : "bg-white text-muted-foreground border-border"}`}
            >
              <CheckCircle2 className="w-3 h-3 inline mr-1" />
              Completas ({summary.completeFolders})
            </button>
            <button
              onClick={() => setFilter("partial")}
              className={`text-xs px-2.5 py-1 rounded border ${filter === "partial" ? "bg-[hsl(217,91%,50%)] text-white border-transparent" : "bg-white text-muted-foreground border-border"}`}
            >
              <Clock className="w-3 h-3 inline mr-1" />
              Parciais ({folders.filter((f) => f.pct > 0 && f.pct < 100).length})
            </button>
            <button
              onClick={() => setFilter("empty")}
              className={`text-xs px-2.5 py-1 rounded border ${filter === "empty" ? "bg-[hsl(217,91%,50%)] text-white border-transparent" : "bg-white text-muted-foreground border-border"}`}
            >
              <AlertCircle className="w-3 h-3 inline mr-1" />
              Vazias/Pendentes ({folders.filter((f) => f.pct === 0).length})
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="ml-auto text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>

          {/* Resumo numérico */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="border border-border rounded px-3 py-2">
              <div className="text-[10px] uppercase text-muted-foreground">Pastas</div>
              <div className="font-bold text-foreground">{summary.totalFolders}</div>
            </div>
            <div className="border border-border rounded px-3 py-2">
              <div className="text-[10px] uppercase text-muted-foreground">Arquivos</div>
              <div className="font-bold text-foreground">{summary.totalFiles}</div>
            </div>
            <div className="border border-border rounded px-3 py-2">
              <div className="text-[10px] uppercase text-muted-foreground">Lidos</div>
              <div className="font-bold text-[hsl(142,76%,30%)]">{summary.processed}</div>
            </div>
            <div className="border border-border rounded px-3 py-2">
              <div className="text-[10px] uppercase text-muted-foreground">Pendentes / Falhas</div>
              <div className="font-bold text-[hsl(38,92%,40%)]">
                {summary.pending} <span className="text-muted-foreground">/</span>{" "}
                <span className="text-[hsl(0,84%,55%)]">{summary.failed}</span>
              </div>
            </div>
            <div className="border border-border rounded px-3 py-2">
              <div className="text-[10px] uppercase text-muted-foreground">Reprocessos</div>
              <div className="font-bold text-[hsl(258,90%,56%)]">{summary.reprocess}</div>
            </div>
          </div>

          {/* Lista */}
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[hsl(220,15%,97%)]">
                <tr className="text-left text-[11px] uppercase text-muted-foreground border-b">
                  <th className="py-2 px-3 font-semibold w-[130px] text-center" title="Código canônico da pasta extraído do arquivo de referência 'Código de Pastas OneDrive'">Código da Pasta</th>
                  <th className="py-2 px-3 font-semibold">Pasta</th>
                  <th className="py-2 px-3 font-semibold text-right">Arquivos</th>
                  <th className="py-2 px-3 font-semibold text-right">Lidos</th>
                  <th className="py-2 px-3 font-semibold text-right">Pendentes</th>
                  <th className="py-2 px-3 font-semibold text-right">Falhas</th>
                  <th className="py-2 px-3 font-semibold text-right">Reprocesso</th>
                  <th className="py-2 px-3 font-semibold w-[180px]">Progresso</th>
                </tr>
              </thead>
              <tbody>
                {loading && monthFilteredRows.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-6 text-xs text-muted-foreground">Carregando pastas…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-6 text-xs text-muted-foreground">
                    {rows.length === 0
                      ? "Nenhum arquivo encontrado no OneDrive para este Prospeccao."
                      : effectiveMonth !== "all"
                        ? `Nenhuma pasta encontrada para ${monthLabel(effectiveMonth)}.`
                        : "Nenhuma pasta no filtro atual."}
                  </td></tr>
                )}
                {filtered.map((f) => {
                  const canonicalDip = f.dipId != null ? DIP_FOLDERS.find((x) => x.id === f.dipId) : undefined;
                  const displayLabel = canonicalDip?.label ?? f.canonicalLabel ?? f.folder;
                  const isExpanded = expandedFolder === f.folder;
                  const folderFiles = isExpanded
                    ? monthFilteredRows
                        .filter((r) => folderKey(r.path || "").key === f.folder)
                        .sort((a, b) => (a.file_name || "").localeCompare(b.file_name || ""))
                    : [];
                  // Pega um path completo de amostra (qualquer arquivo da pasta) para mostrar como subtítulo.
                  const sampleFull = (f as any).sample || "";
                  return (
                    <Fragment key={f.folder}>
                      <tr
                        className={`border-b last:border-0 cursor-pointer ${
                          f.missing
                            ? "bg-[hsl(38,92%,50%)]/5 hover:bg-[hsl(38,92%,50%)]/10"
                            : "hover:bg-[hsl(220,15%,98%)]"
                        }`}
                        onClick={() => !f.missing && setExpandedFolder(isExpanded ? null : f.folder)}
                      >
                        <td className="py-2 px-3 text-center font-mono text-sm font-semibold text-[hsl(217,91%,40%)] border-r border-border/40">
                          {f.dipId != null
                            ? (folderNumbering.get(f.dipId)?.onedriveNumber ?? String(f.dipId).padStart(2, "0"))
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-3 font-medium text-foreground max-w-[420px]" title={displayLabel}>
                          <div className="flex items-center gap-2">
                            {f.missing
                              ? <FileWarning className="w-3.5 h-3.5 text-[hsl(38,92%,50%)] flex-shrink-0" />
                              : isExpanded
                                ? <FolderOpen className="w-3.5 h-3.5 text-[hsl(217,91%,50%)] flex-shrink-0" />
                                : <Folder className="w-3.5 h-3.5 text-[hsl(217,91%,50%)] flex-shrink-0" />}
                            <span className={`truncate ${f.missing ? "text-muted-foreground italic" : ""}`}>{displayLabel}</span>
                            {f.missing && (
                              <span className="ml-2 text-[9px] uppercase font-bold tracking-wide text-[hsl(38,92%,40%)] bg-[hsl(38,92%,50%)]/15 px-1.5 py-0.5 rounded">
                                Sem arquivos
                              </span>
                            )}
                          </div>
                          {!f.missing && sampleFull && (
                            <div className="text-[10px] text-muted-foreground truncate pl-5" title={sampleFull}>{sampleFull}</div>
                          )}
                        </td>

                        <td className="py-2 px-3 text-right font-mono">{f.files}</td>
                        <td className="py-2 px-3 text-right font-mono text-[hsl(142,76%,30%)]">{f.processed}</td>
                        <td className="py-2 px-3 text-right font-mono text-[hsl(38,92%,40%)]">{f.pending}</td>
                        <td className="py-2 px-3 text-right font-mono text-[hsl(0,84%,55%)]">{f.failed}</td>
                        <td className="py-2 px-3 text-right font-mono text-[hsl(258,90%,56%)]">
                          {f.reprocess > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <RotateCw className="w-3 h-3" />
                              {f.reprocess}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-[hsl(220,15%,92%)] overflow-hidden">
                              <div className={`h-full ${pctColor(f.pct)} transition-all`} style={{ width: `${f.pct}%` }} />
                            </div>
                            <span className="text-[11px] font-semibold w-9 text-right">{f.pct}%</span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-[hsl(220,15%,98%)]">
                          <td colSpan={8} className="p-0">
                            <div className="px-6 py-3 border-t border-border">
                              <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-2">
                                Arquivos da pasta ({folderFiles.length})
                              </div>
                              {folderFiles.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-2">Sem arquivos.</div>
                              ) : (
                                <ul className="space-y-1">
                                  {folderFiles.map((r, idx) => {
                                    const st = (r.status || "").toLowerCase();
                                    const isDone = !!r.last_processed_at;
                                    const isFail = st.includes("fail") || st.includes("error") || st === "manual_upload_required";
                                    const isProc = !isDone && (st === "processing" || st === "queued");
                                    const statusLabel = isDone
                                      ? "Lido"
                                      : isFail
                                      ? "Falha"
                                      : isProc
                                      ? "Processando"
                                      : "Pendente";
                                    const statusClass = isDone
                                      ? "bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,30%)]"
                                      : isFail
                                      ? "bg-[hsl(0,84%,60%)]/10 text-[hsl(0,84%,55%)]"
                                      : isProc
                                      ? "bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)]"
                                      : "bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,40%)]";
                                    const isSelected = selectedFile === r.path;
                                    const key = fileKey(r);
                                    const isUnderReview = r.status === "under_review" || (r.metadata as any)?.under_review;
                                    const isPendingDel = pendingDelete === key;
                                    const busy = busyKey === key;
                                    const targetId = moveTarget[key];
                                    return (
                                      <li
                                        key={`${r.path}-${idx}`}
                                        className={`text-xs rounded border transition-all ${
                                          isSelected
                                            ? "border-[hsl(217,91%,50%)] bg-[hsl(217,91%,50%)]/10 ring-2 ring-[hsl(217,91%,50%)]/30 shadow-sm"
                                            : "border-transparent hover:border-[hsl(217,91%,50%)]/40 hover:bg-[hsl(217,91%,50%)]/5"
                                        }`}
                                      >
                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedFile(isSelected ? null : r.path);
                                            if (isSelected) setPendingDelete(null);
                                          }}
                                          className="flex items-center justify-between gap-3 py-1 px-2 cursor-pointer"
                                          title={isSelected ? "Clique novamente para fechar" : "Clique para abrir ações deste arquivo"}
                                        >
                                          <span className={`truncate flex-1 ${isSelected ? "font-semibold text-[hsl(217,91%,40%)]" : "text-foreground"}`} title={r.file_name || r.path}>
                                            {r.file_name || r.path.split("/").pop()}
                                          </span>
                                          {isUnderReview && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,40%)]">
                                              Em validação
                                            </span>
                                          )}
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusClass}`}>
                                            {statusLabel}
                                          </span>
                                          {(r.reprocess_count ?? 0) > 0 && (
                                            <span className="text-[10px] text-[hsl(258,90%,56%)] inline-flex items-center gap-1">
                                              <RotateCw className="w-3 h-3" />
                                              {r.reprocess_count}
                                            </span>
                                          )}
                                        </div>

                                        {isSelected && (
                                          <div className="border-t border-[hsl(217,91%,50%)]/20 px-3 py-2 space-y-2 bg-white rounded-b">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <Move className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
                                              <span className="text-[11px] font-semibold text-muted-foreground">Mover para:</span>
                                              <select
                                                value={targetId ?? ""}
                                                onChange={(e) => {
                                                  const v = e.target.value ? Number(e.target.value) : undefined;
                                                  setMoveTarget((s) => {
                                                    const n = { ...s };
                                                    if (v == null) delete n[key]; else n[key] = v;
                                                    return n;
                                                  });
                                                }}
                                                className="text-xs px-2 py-1 rounded border border-border bg-white text-foreground max-w-[280px]"
                                              >
                                                <option value="">Selecione uma pasta…</option>
                                                {DIP_FOLDERS.map((f) => {
                                                  const ref = folderNumbering.get(f.id);
                                                  const arq = ref?.fileNumber ?? "—";
                                                  return (
                                                    <option key={f.id} value={f.id}>
                                                      OD {String(f.id).padStart(2, "0")} · Arq {arq} · {f.label}
                                                    </option>
                                                  );
                                                })}
                                              </select>
                                              <button
                                                disabled={busy || !targetId}
                                                onClick={() => targetId && moveFile(r, targetId)}
                                                className="text-[11px] px-2.5 py-1 rounded bg-[hsl(217,91%,50%)] text-white disabled:opacity-50"
                                              >
                                                Mover
                                              </button>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
                                              <button
                                                disabled={busy || isUnderReview}
                                                onClick={() => markUnderReview(r)}
                                                className="text-[11px] px-2.5 py-1 rounded border border-[hsl(38,92%,50%)]/50 text-[hsl(38,92%,40%)] bg-[hsl(38,92%,50%)]/10 hover:bg-[hsl(38,92%,50%)]/20 disabled:opacity-50 inline-flex items-center gap-1"
                                                title="Suspende uso dos dados extraídos; não contabiliza no mês"
                                              >
                                                <PauseCircle className="w-3 h-3" />
                                                {isUnderReview ? "Já em validação" : "Marcar para validar"}
                                              </button>

                                              {!isPendingDel ? (
                                                <button
                                                  disabled={busy}
                                                  onClick={() => setPendingDelete(key)}
                                                  className="text-[11px] px-2.5 py-1 rounded border border-[hsl(0,84%,60%)]/50 text-[hsl(0,84%,55%)] bg-[hsl(0,84%,60%)]/10 hover:bg-[hsl(0,84%,60%)]/20 disabled:opacity-50 inline-flex items-center gap-1"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                  Excluir arquivo
                                                </button>
                                              ) : (
                                                <span className="inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded bg-[hsl(0,84%,60%)]/10 border border-[hsl(0,84%,60%)]/40 text-[hsl(0,84%,40%)]">
                                                  <AlertTriangle className="w-3 h-3" />
                                                  Confirmacaor exclusão definitiva?
                                                  <button
                                                    disabled={busy}
                                                    onClick={() => deleteFile(r)}
                                                    className="ml-1 px-2 py-0.5 rounded bg-[hsl(0,84%,55%)] text-white disabled:opacity-50"
                                                  >
                                                    Sim, excluir
                                                  </button>
                                                  <button
                                                    disabled={busy}
                                                    onClick={() => setPendingDelete(null)}
                                                    className="px-2 py-0.5 rounded border border-border bg-white text-foreground"
                                                  >
                                                    Cancelar
                                                  </button>
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
