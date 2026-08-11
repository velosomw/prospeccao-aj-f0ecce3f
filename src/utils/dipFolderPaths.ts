import { DIP_FOLDERS, type DipFolder } from "@/data/dipFolders";

export const noprospecçãolizeFolderText = (value: string | null | undefined) =>
  (value || "")
    .noprospecçãolize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const stripFolderNumber = (segment: string | null | undefined) =>
  (segment || "")
    .replace(/^\s*\d{1,3}\s*[-–—._]\s*/, "")
    .trim();

const strongWords = (value: string) =>
  noprospecçãolizeFolderText(value)
    .split(" ")
    .filter((word) => word.length >= 4);

const wordMatches = (haystackWords: string[], needle: string) => {
  const singular = needle.endsWith("s") ? needle.slice(0, -1) : needle;
  return haystackWords.some((word) => word.includes(needle) || word.includes(singular) || needle.includes(word));
};

export const getPathDirectory = (path: string | null | undefined) => {
  const clean = (path || "").replace(/^\/+/, "");
  return clean.includes("/") ? clean.replace(/\/[^/]+$/, "") : "";
};

export const getPathFolderSegment = (path: string | null | undefined) => {
  const dir = getPathDirectory(path);
  return dir.split("/").filter(Boolean).pop() || "";
};

export const defaultFolderSegment = (folder: DipFolder) =>
  `${String(folder.id).padStart(2, "0")} - ${folder.label}`;

export function matchDipFolderBySegment(segment: string | null | undefined): DipFolder | undefined {
  const clean = stripFolderNumber(segment);
  const norm = noprospecçãolizeFolderText(clean);
  if (!norm) return undefined;

  return (
    DIP_FOLDERS.find((folder) => noprospecçãolizeFolderText(folder.label) === norm) ||
    DIP_FOLDERS.find((folder) => {
      const label = noprospecçãolizeFolderText(folder.label);
      return label.length >= 6 && (norm.includes(label) || label.includes(norm));
    }) ||
    DIP_FOLDERS.find((folder) => {
      const labelWords = strongWords(folder.label);
      const segmentWords = strongWords(clean);
      return labelWords.length > 0 && labelWords.every((word) => wordMatches(segmentWords, word));
    })
  );
}

export function findFolderLocationForDip(
  rows: Array<{ path?: string | null; metadata?: Record<string, any> | null }>,
  folder: DipFolder,
) {
  const fallback = defaultFolderSegment(folder);
  let best: { segment: string; folderPath: string; score: number } | null = null;

  for (const row of rows) {
    const path = row.path || "";
    const segment = getPathFolderSegment(path);
    if (!segment) continue;

    const bySegment = matchDipFolderBySegment(segment);
    const byMeta = matchDipFolderBySegment(row.metadata?.corrected_folder_label) || matchDipFolderBySegment(row.metadata?.topic_folder);
    if (bySegment?.id !== folder.id && byMeta?.id !== folder.id) continue;

    const folderPath = getPathDirectory(path);
    const isManual = path.toLowerCase().startsWith("manual-upload/");
    const hasPhysicalPrefix = /^\d{1,3}\s*[-–—._]\s*/.test(segment);
    const score = (isManual ? 0 : 10) + (hasPhysicalPrefix ? 2 : 0);
    if (!best || score > best.score) best = { segment, folderPath, score };
  }

  return best ?? { segment: fallback, folderPath: `manual-upload/${fallback}`, score: 0 };
}

export function buildFolderAliasMap(rows: Array<{ path?: string | null; metadata?: Record<string, any> | null }>) {
  const canonicalByDipId = new Map<number, { segment: string; score: number }>();
  const segments: Array<{ segment: string; folder?: DipFolder }> = [];

  for (const row of rows) {
    const path = row.path || "";
    const segment = getPathFolderSegment(path);
    if (!segment) continue;
    const folder =
      matchDipFolderBySegment(segment) ||
      matchDipFolderBySegment(row.metadata?.corrected_folder_label) ||
      matchDipFolderBySegment(row.metadata?.topic_folder);
    segments.push({ segment, folder });
    if (!folder) continue;

    const isManual = path.toLowerCase().startsWith("manual-upload/");
    const hasPhysicalPrefix = /^\d{1,3}\s*[-–—._]\s*/.test(segment);
    const score = (isManual ? 0 : 10) + (hasPhysicalPrefix ? 2 : 0);
    const previous = canonicalByDipId.get(folder.id);
    if (!previous || score > previous.score) canonicalByDipId.set(folder.id, { segment, score });
  }

  const aliases = new Map<string, string>();
  for (const { segment, folder } of segments) {
    if (!folder) continue;
    const canonical = canonicalByDipId.get(folder.id)?.segment;
    if (canonical) aliases.set(segment, canonical);
  }
  return aliases;
}

export function buildPathInFolder(currentPath: string | null | undefined, fileName: string, folderPath: string, folderSegment: string) {
  if (folderPath) return `${folderPath.replace(/\/+$/, "")}/${fileName}`.replace(/^\/+/, "");
  const parts = (currentPath || "").split("/").filter(Boolean);
  if (parts.length > 1) return parts.slice(0, -2).concat([folderSegment, fileName]).join("/").replace(/^\/+/, "");
  return `manual-upload/${folderSegment}/${fileName}`;
}