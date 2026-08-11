// Shared helper: matches a OneDrive file path/name against an Prospeccao topic number.
//
// PROBLEMA ANTERIOR:
//   O regex /(^|\/)0?N[\s._-]/ batia em qualquer segmento numerado, incluindo
//   pastas de mês (`01.2026`, `12.2025`). Resultado: o tópico 1 contava todos
//   os arquivos de janeiro, gerando contagens infladas (ex.: "29/60").
//
// REGRAS NOVAS:
//   1. O número precisa estar em um segmento que se pareça com pasta de tópico:
//      "NN - Nome", "NN_Nome", "NN.Nome", "NN-Nome".
//   2. Pastas de competência (`MM.YYYY`, `MM-YYYY`, `MM_YYYY`) são ignoradas.
//   3. Arquivos temporários do Office (~$, .~lock) e ocultos são descartados.
//   4. Apenas o segmento de pasta IMEDIATAMENTE pai do arquivo é considerado
//      o "tópico" — evita herança em subpastas que reciclam o mesmo número.

const COMPETENCIA_RE = /^\d{1,2}[._-]\d{4}$/; // 01.2026, 12-2025
const TOPIC_PREFIX_RE = (n: number) =>
  new RegExp(`^0*${n}\\s*[\\-_.\\s]+\\S`, "i"); // "01 - Nome", "5_Nome", "12.Algo"

export interface TopicFileLike {
  path?: string | null;
  file_name?: string | null;
}

export function isTempOrHiddenFile(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim();
  if (!n) return true;
  if (n.startsWith("~$")) return true;        // Office lockfile
  if (n.startsWith(".~lock")) return true;    // LibreOffice
  if (n.startsWith("._")) return true;        // macOS resource fork
  if (n.toLowerCase() === ".ds_store") return true;
  if (n.toLowerCase() === "thumbs.db") return true;
  return false;
}

/** Devolve o segmento de pasta que representa o tópico (NN - Nome) ou null. */
export function topicSegmentFromPath(path: string | null | undefined): {
  segment: string;
  number: number;
} | null {
  if (!path) return null;
  const segments = path.split("/").filter(Boolean);
  // pasta-pai do arquivo (último segmento é o file_name)
  for (let i = segments.length - 2; i >= 0; i--) {
    const seg = segments[i];
    if (COMPETENCIA_RE.test(seg)) continue;
    const m = seg.match(/^(\d{1,3})\s*[\-_.\s]+\S/);
    if (m) return { segment: seg, number: Number(m[1]) };
  }
  return null;
}

/** True se o arquivo pertence ao tópico `n` (regra estrita). */
export function fileMatchesTopic(file: TopicFileLike, n: number): boolean {
  if (!file) return false;
  if (isTempOrHiddenFile(file.file_name ?? "")) return false;
  const seg = topicSegmentFromPath(file.path);
  if (!seg) return false;
  if (seg.number !== n) return false;
  return TOPIC_PREFIX_RE(n).test(seg.segment);
}

/** Aplica filtros globais (lockfiles, ocultos) antes de qualquer scoring. */
export function filterIngestibleFiles<T extends TopicFileLike>(files: T[] | null | undefined): T[] {
  if (!Array.isArray(files)) return [];
  return files.filter((f) => !isTempOrHiddenFile(f.file_name ?? ""));
}
