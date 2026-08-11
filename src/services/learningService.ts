// Learning Service — orquestração da tela de Validação/Aprendizado de Documentos
// Fluxo:
//   1. uploadLearningFile(file)       → envia arquivo ao bucket "learning-docs" e devolve URL pública.
//   2. extractTextFromFile(file, url) → produz { rawText, normalized, source } usando o método correto
//        - imagens/PDF  → ocr-google-vision (sync ou async, com fileUrl)
//        - txt/csv      → leitura local
//        - xlsx/xls     → SheetJS (xlsx) → CSV string
//   3. processWithAI({ text, ... })    → invoca ai-process (engine de agentes)
//   4. listPendingExtractions/listLearningExtractions / submitGroundTruth / saveFieldFeedback
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase-any";
import { processDocument, waitForProcessing, type AiProcessStatus, type AiProcessSyncResult, type AiProcessAsyncStarted } from "@/services/aiProcessService";
import { submitCorrection } from "@/services/datasetService";

const BUCKET = "learning-docs";

// ---------- Tipos ----------
export type FileKind = "image" | "pdf" | "text" | "spreadsheet" | "unknown";

export interface UploadedLearningFile {
  path: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  kind: FileKind;
  size: number;
}

export interface ExtractedTextResult {
  rawText: string;
  normalizedText: string;
  ocrConfidence: number | null;
  pageCount: number | null;
  ocrResultId?: string;
  /** Quando o OCR é assíncrono (PDF > 5 páginas) este id permite polling externo. */
  asyncOcrId?: string;
  asyncPollUrl?: string;
  method: "google_vision" | "client_text" | "client_xlsx";
}

export interface LearningExtraction {
  id: string;
  document_id: string | null;
  prospeccao_id: string | null;
  path: string | null;
  classe: string | null;
  agent: string | null;
  raw_text: string | null;
  normalized_text: string | null;
  extracted_data: Record<string, unknown> | null;
  validation: { valido: boolean; correcoes: unknown[]; confianca: number } | null;
  final_confidence: number | null;
  ocr_confidence: number | null;
  ai_confidence: number | null;
  valid: boolean | null;
  status: string;
  source: string;
  created_at: string;
}

// ---------- Detecção de tipo ----------
export function detectFileKind(file: File): FileKind {
  const m = (file.type || "").toLowerCase();
  const n = file.name.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.startsWith("text/") || n.endsWith(".txt") || n.endsWith(".csv") || n.endsWith(".log")) return "text";
  if (
    n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm") ||
    m.includes("spreadsheet") || m.includes("excel")
  ) return "spreadsheet";
  return "unknown";
}

// ---------- Upload ----------
export async function uploadLearningFile(file: File): Promise<UploadedLearningFile> {
  const kind = detectFileKind(file);
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}_${safe}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);

  // Bucket privado: usamos URL assinada temporária (2h) em vez de URL pública.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 2);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`Falha ao gerar URL do arquivo: ${signErr?.message ?? "desconhecido"}`);
  }

  return {
    path,
    publicUrl: signed.signedUrl,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    kind,
    size: file.size,
  };
}

// ---------- Normalização local (espelho do edge OCR) ----------
function normalizeText(text: string): string {
  return text
    .replace(/l(?=\d)/g, "1")
    .replace(/O(?=\d)/g, "0")
    .replace(/R\$\s?l/g, "R$ 1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- Extração: texto puro (TXT/CSV) ----------
async function readAsText(file: File): Promise<string> {
  return await file.text();
}

// ---------- Extração: planilha (XLSX/XLS) → CSV concatenado ----------
async function readSpreadsheet(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ";" });
    out.push(`# Planilha: ${name}\n${csv}`);
  }
  return out.join("\n\n");
}

// ---------- Extração unificada ----------
export async function extractTextFromFile(
  file: File,
  uploaded: UploadedLearningFile,
): Promise<ExtractedTextResult> {
  if (uploaded.kind === "text") {
    const raw = await readAsText(file);
    return {
      rawText: raw,
      normalizedText: normalizeText(raw),
      ocrConfidence: 1,
      pageCount: 1,
      method: "client_text",
    };
  }

  if (uploaded.kind === "spreadsheet") {
    const raw = await readSpreadsheet(file);
    return {
      rawText: raw,
      normalizedText: normalizeText(raw),
      ocrConfidence: 1,
      pageCount: null,
      method: "client_xlsx",
    };
  }

  // Imagens e PDFs → Google Vision (Document AI)
  // persist=true: garante rastreabilidade do OCR em ocr_results para auditoria
  const { data, error } = await supabase.functions.invoke("ocr-google-vision", {
    body: {
      fileUrl: uploaded.publicUrl,
      mimeType: uploaded.mimeType,
      persist: true,
    },
  });
  if (error) throw new Error(`OCR falhou: ${error.message}`);
  const r = data as {
    mode?: "sync" | "async";
    text?: string;
    rawText?: string;
    confidence?: number;
    pageCount?: number;
    resultId?: string;
    pollUrl?: string;
  };

  if (r.mode === "async") {
    return {
      rawText: "",
      normalizedText: "",
      ocrConfidence: null,
      pageCount: null,
      asyncOcrId: r.resultId,
      asyncPollUrl: r.pollUrl,
      method: "google_vision",
    };
  }

  return {
    rawText: r.rawText || r.text || "",
    normalizedText: r.text || "",
    ocrConfidence: r.confidence ?? null,
    pageCount: r.pageCount ?? null,
    ocrResultId: r.resultId,
    method: "google_vision",
  };
}

// ---------- Polling do OCR assíncrono (PDFs grandes) ----------
export interface OcrAsyncStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  pages_processed?: number | null;
  pages_total?: number | null;
  confidence?: number | null;
  error_message?: string | null;
}

export async function getOcrAsyncStatus(id: string): Promise<OcrAsyncStatus> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-google-vision?id=${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!r.ok) throw new Error(`Falha status OCR: ${r.status}`);
  return (await r.json()) as OcrAsyncStatus;
}

export async function waitForOcr(
  id: string,
  onProgress?: (s: OcrAsyncStatus) => void,
  intervalMs = 2500,
  timeoutMs = 10 * 60 * 1000,
): Promise<{ rawText: string; normalizedText: string; confidence: number | null; pageCount: number | null }> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const s = await getOcrAsyncStatus(id);
    onProgress?.(s);
    if (s.status === "completed" || s.status === "failed") {
      if (s.status === "failed") throw new Error(s.error_message || "OCR falhou");
      // Busca o registro completo para pegar o texto
      const { data } = await supabase
        .from("ocr_results")
        .select("raw_text,normalized_text,confidence,page_count")
        .eq("id", id)
        .maybeSingle();
      return {
        rawText: data?.raw_text || "",
        normalizedText: data?.normalized_text || "",
        confidence: data?.confidence ?? null,
        pageCount: data?.page_count ?? null,
      };
    }
    if (Date.now() - start > timeoutMs) throw new Error("Timeout OCR");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ---------- Processar com IA (engine de agentes) ----------
export interface ProcessLearningInput {
  rawText: string;
  normalizedText?: string;
  path?: string;
  ocrConfidence?: number | null;
}

export async function processWithAI(input: ProcessLearningInput): Promise<AiProcessSyncResult | AiProcessAsyncStarted> {
  return await processDocument({
    text: input.rawText,
    normalized_text: input.normalizedText,
    path: input.path,
    ocr_confidence: input.ocrConfidence ?? undefined,
    async: true,
  });
}

export { waitForProcessing };
export type { AiProcessStatus, AiProcessSyncResult, AiProcessAsyncStarted };

// ---------- Marcar extração como vinda do learning loop ----------
export async function markExtractionAsLearning(
  extractionId: string,
  uploadInfo: { path: string; mimeType: string; fileName: string },
): Promise<void> {
  // Preserva o `path` original (usado pelo prompt builder como contexto de pasta)
  // e grava a referência do arquivo de aprendizado em `partial_results.learning_file`.
  const { data: current } = await supabase
    .from("ai_extractions")
    .select("partial_results")
    .eq("id", extractionId)
    .maybeSingle();
  const prevPartial =
    (current?.partial_results as Record<string, unknown> | null) || {};
  const { error } = await supabase
    .from("ai_extractions")
    .update({
      source: "learning",
      partial_results: {
        ...prevPartial,
        learning_file: {
          bucket: "learning-docs",
          path: uploadInfo.path,
          mime_type: uploadInfo.mimeType,
          file_name: uploadInfo.fileName,
        },
      },
    })
    .eq("id", extractionId);
  if (error) console.warn("markExtractionAsLearning:", error.message);
}

// ---------- Listagens ----------
export async function listLearningExtractions(limit = 50): Promise<LearningExtraction[]> {
  const { data, error } = await supabase
    .from("ai_extractions")
    .select("*")
    .eq("source", "learning")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as unknown as LearningExtraction[];
}

export interface PendingFilters {
  classe?: string | null;
  onlyErrors?: boolean;
  maxConfidence?: number;
  limit?: number;
}

export async function listPendingExtractions(filters: PendingFilters = {}): Promise<LearningExtraction[]> {
  const { classe, onlyErrors = false, maxConfidence = 0.85, limit = 50 } = filters;
  let q = supabase
    .from("ai_extractions")
    .select("*")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (classe) q = q.eq("classe", classe);
  if (onlyErrors) q = q.eq("valid", false);
  else q = q.or(`final_confidence.lt.${maxConfidence},valid.eq.false`);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as LearningExtraction[];
}

// ---------- Ground truth + feedback campo-a-campo ----------
export interface SaveCorrectionInput {
  extraction: LearningExtraction;
  correctedText?: string;
  correctedJson: Record<string, unknown>;
  notes?: string;
}

/** Calcula diff campo-a-campo entre dois objetos (1 nível). */
function diffFields(
  oldObj: Record<string, unknown> | null | undefined,
  newObj: Record<string, unknown>,
): Array<{ field: string; old_value: unknown; new_value: unknown }> {
  const out: Array<{ field: string; old_value: unknown; new_value: unknown }> = [];
  const keys = new Set([
    ...Object.keys(oldObj || {}),
    ...Object.keys(newObj || {}),
  ]);
  for (const k of keys) {
    const a = oldObj?.[k];
    const b = newObj?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ field: k, old_value: a, new_value: b });
    }
  }
  return out;
}

/**
 * Salva correção como ground truth (`dataset_validated` + `prompt_examples` via ai-validate)
 * e registra diff campo-a-campo em `dataset_feedback`.
 */
export async function saveGroundTruth(input: SaveCorrectionInput) {
  const e = input.extraction;
  if (!e.classe) throw new Error("Extração sem classe — impossível validar");

  const corrections = diffFields(
    e.extracted_data as Record<string, unknown> | null,
    input.correctedJson,
  );

  // 1) ai-validate → grava dataset_validated + embedding + prompt_examples
  const result = await submitCorrection({
    extraction_id: e.id,
    document_id: e.document_id ?? undefined,
    prospeccao_id: e.prospeccao_id ?? undefined,
    classe: e.classe,
    agent: e.agent ?? undefined,
    path: e.path ?? undefined,
    input_text: input.correctedText || e.normalized_text || e.raw_text || "",
    normalized_text: input.correctedText ? normalizeText(input.correctedText) : (e.normalized_text ?? undefined),
    output_original: (e.extracted_data ?? undefined) as Record<string, unknown> | undefined,
    output_correto: input.correctedJson,
    corrections: corrections.map((c) => ({
      campo: c.field,
      valor_anterior: c.old_value,
      valor_corrigido: c.new_value,
    })),
    notes: input.notes,
  });

  // 2) Persiste feedback campo-a-campo (treino fino futuro)
  if (corrections.length > 0) {
    const { data: userResp } = await supabase.auth.getUser();
    const rows = corrections.map((c) => ({
      document_id: e.document_id,
      extraction_id: e.id,
      validated_id: result.id,
      classe: e.classe,
      field: c.field,
      old_value: c.old_value as never,
      new_value: c.new_value as never,
      created_by: userResp?.user?.id ?? null,
    }));
    const { error } = await supabase.from("dataset_feedback").insert(rows);
    if (error) console.warn("dataset_feedback insert:", error.message);
  }

  return { ...result, corrections_count: corrections.length };
}

/** Marca a extração como "Correta" sem alterações (atalho). */
export async function markAsCorrect(extraction: LearningExtraction) {
  if (!extraction.extracted_data) throw new Error("Sem JSON para confiprospeccaor");
  return await saveGroundTruth({
    extraction,
    correctedJson: extraction.extracted_data,
    notes: "Marcado como correto (sem alterações)",
  });
}
