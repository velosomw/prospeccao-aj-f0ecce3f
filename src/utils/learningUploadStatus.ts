export type LearningUploadStatus = "processing" | "done" | "error";

export interface LearningUploadStatusRecord {
  prospecçãoId: string;
  fileName: string;
  path?: string | null;
  folderId?: number | null;
  folderLabel?: string | null;
  status: LearningUploadStatus;
  progress?: number | null;
  confidence?: number | null;
  message?: string | null;
  updatedAt: string;
}

const KEY = "learning-upload-status:v1";
const EVENT = "learning-upload-status-change";
const TTL_MS = 24 * 60 * 60 * 1000;

function readAll(): LearningUploadStatusRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const rows = raw ? (JSON.parse(raw) as LearningUploadStatusRecord[]) : [];
    const fresh = rows.filter((r) => Date.now() - new Date(r.updatedAt).getTime() < TTL_MS);
    if (fresh.length !== rows.length) window.localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return [];
  }
}

function writeAll(rows: LearningUploadStatusRecord[]) {
  window.localStorage.setItem(KEY, JSON.stringify(rows));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function listLearningUploadStatuses(prospecçãoId: string): LearningUploadStatusRecord[] {
  return readAll().filter((r) => r.prospecçãoId === prospecçãoId);
}

export function recordLearningUploadStatus(input: Omit<LearningUploadStatusRecord, "updatedAt">) {
  const key = input.fileName.toLowerCase();
  const next: LearningUploadStatusRecord = { ...input, updatedAt: new Date().toISOString() };
  const rows = readAll().filter((r) => !(r.prospecçãoId === input.prospecçãoId && r.fileName.toLowerCase() === key));
  writeAll([next, ...rows].slice(0, 200));
}

export function subscribeLearningUploadStatuses(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}