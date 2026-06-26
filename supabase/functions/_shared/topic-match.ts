// Mirror Deno do src/lib/topicMatch.ts — usado pelo edge `rma-score` e
// outros workers para garantir contagem coerente de tópicos.
const COMPETENCIA_RE = /^\d{1,2}[._-]\d{4}$/;
const TOPIC_PREFIX_RE = (n: number) =>
  new RegExp(`^0*${n}\\s*[\\-_.\\s]+\\S`, "i");

export interface TopicFileLike {
  path?: string | null;
  file_name?: string | null;
}

export function isTempOrHiddenFile(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim();
  if (!n) return true;
  if (n.startsWith("~$")) return true;
  if (n.startsWith(".~lock")) return true;
  if (n.startsWith("._")) return true;
  if (n.toLowerCase() === ".ds_store") return true;
  if (n.toLowerCase() === "thumbs.db") return true;
  return false;
}

export function topicSegmentFromPath(
  path: string | null | undefined,
): { segment: string; number: number } | null {
  if (!path) return null;
  const segments = path.split("/").filter(Boolean);
  for (let i = segments.length - 2; i >= 0; i--) {
    const seg = segments[i];
    if (COMPETENCIA_RE.test(seg)) continue;
    const m = seg.match(/^(\d{1,3})\s*[\-_.\s]+\S/);
    if (m) return { segment: seg, number: Number(m[1]) };
  }
  return null;
}

export function fileMatchesTopic(file: TopicFileLike, n: number): boolean {
  if (!file) return false;
  if (isTempOrHiddenFile(file.file_name ?? "")) return false;
  const seg = topicSegmentFromPath(file.path);
  if (!seg) return false;
  if (seg.number !== n) return false;
  return TOPIC_PREFIX_RE(n).test(seg.segment);
}

export function filterIngestibleFiles<T extends TopicFileLike>(
  files: T[] | null | undefined,
): T[] {
  if (!Array.isArray(files)) return [];
  return files.filter((f) => !isTempOrHiddenFile(f.file_name ?? ""));
}

export function dedupFiles<T extends TopicFileLike>(files: T[]): T[] {
  const seen = new Set<string>();
  return files.filter((f) => {
    const key = `${(f.path || "").toLowerCase()}::${(f.file_name || "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
