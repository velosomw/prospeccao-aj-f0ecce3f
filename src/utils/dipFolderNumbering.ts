import { DIP_FOLDERS, type DipFolder } from "@/data/dipFolders";
import { buildFolderAliasMap, getPathFolderSegment, matchDipFolderBySegment } from "@/utils/dipFolderPaths";

/**
 * Numeração unificada usada nas 3 abas de "Treinar IA" para manter a mesma
 * correspondência de pastas:
 *  - `onedriveNumber` (OD): prefixo canônico DIP (01-60). Constante por pasta.
 *  - `fileNumber`     (Arq): posição sequencial dentro do conjunto de pastas
 *                            efetivamente aplicadas no Prospecção (varia por Prospecção).
 */
export interface FolderNumberingRef {
  dipId: number;
  onedriveNumber: string;
  fileNumber: string;
  folder: DipFolder;
}

export function buildFolderNumbering(appliedDipIds: Iterable<number>): Map<number, FolderNumberingRef> {
  const uniqueSorted = Array.from(new Set(Array.from(appliedDipIds))).sort((a, b) => a - b);
  const map = new Map<number, FolderNumberingRef>();
  uniqueSorted.forEach((id) => {
    const folder = DIP_FOLDERS.find((f) => f.id === id);
    if (!folder) return;
    const canonical = String(folder.id).padStart(2, "0");
    // Nº Lista e Nº OneDrive compartilham a MESMA numeração canônica da pasta
    // (prefixo extraído do path do OneDrive). Isso garante que as abas Worker e
    // Arquivos com Erro mostrem o mesmo número para cada pasta — eliminando a
    // confusão de "número trocado" entre as telas.
    map.set(id, {
      dipId: id,
      onedriveNumber: canonical,
      fileNumber: canonical,
      folder,
    });
  });
  return map;
}

/** Deriva os ids DIP aplicados a partir das rows `onedrive_files` (path + metadata). */
export function deriveAppliedDipIds(
  rows: Array<{ path?: string | null; metadata?: Record<string, any> | null }>,
): number[] {
  const aliases = buildFolderAliasMap(rows);
  const ids = new Set<number>();
  for (const r of rows) {
    const seg = getPathFolderSegment(r.path ?? "");
    const canonical = aliases.get(seg) || seg;
    const f =
      matchDipFolderBySegment(canonical) ||
      matchDipFolderBySegment(r.metadata?.corrected_folder_label) ||
      matchDipFolderBySegment(r.metadata?.topic_folder);
    if (f) ids.add(f.id);
  }
  return Array.from(ids);
}

export function formatFolderRefLabel(ref: FolderNumberingRef): string {
  return `OD ${ref.onedriveNumber} · Arq ${ref.fileNumber} · ${ref.folder.label}`;
}
