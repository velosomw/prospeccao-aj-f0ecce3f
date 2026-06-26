// OCR Cascade v2 — CHEAP-FIRST com pré-classificação por tipo de documento.
//
// Filosofia: começar pelo motor mais barato que tenha chance razoável de
// extrair com qualidade, validar o resultado, e só escalar se falhar ou
// vier com confiança baixa. Telemetria é registrada em ai_usage_logs.
//
// Ordem de tentativas:
//   1. Extratores diretos (xlsx/docx/csv/txt)        custo: ~0
//   2. Gemini 2.5 Flash-Lite (multimodal)            custo: $0.00001/1k in
//   3. Gemini 2.5 Flash (multimodal)                 custo: $0.000075/1k in
//   4. Google Document AI (PDFs estruturados)        custo: $0.0015/pág
//   5. Gemini 2.5 Pro (último recurso premium)       custo: $0.00125/1k in
//   6. Google Vision (fallback final)                custo: $0.0015/pág
//
// Pré-classificação:
//   - PDFs com tabelas contábeis (balancete, DRE) → priorizam Document AI
//   - Imagens simples / scans pequenos → Flash-Lite primeiro
//   - PDFs nativos (texto embutido) → tenta extrair texto direto antes de IA

import { getAppToken } from "./graph-app.ts";
import { lookupOcrCache, sha256Hex, storeOcrCache } from "./ocr-cache.ts";
import { estimateTokens, logAiUsage, modelToService } from "./ai-telemetry.ts";
import { generateEmbeddings } from "./embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const DOC_AI_ENDPOINT = Deno.env.get("GOOGLE_DOCUMENT_AI_ENDPOINT") || "";
const DOC_AI_TOKEN = Deno.env.get("GOOGLE_DOCUMENT_AI_TOKEN") || "";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Limite de qualidade — abaixo disso, escala para o próximo motor
const MIN_ACCEPT_CONFIDENCE = 0.75;
// Threshold reduzido para extratores diretos (XLSX/DOCX/CSV/TXT) — evita escalar
// para Gemini cascade quando a leitura nativa já entrega texto utilizável.
const MIN_ACCEPT_CONFIDENCE_OFFICE = 0.6;
const MIN_ACCEPT_TEXT_LENGTH = 60;

// Heurística para considerar conteúdo "estruturado/contábil" → vale Document AI
const ACCOUNTING_HINT = /\b(balancete|balanço|dre|debito|crédito|haveres|ativo|passivo|patrim[ôo]nio|conta cont[áa]bil|cnpj|cpf)\b/i;

const TEXT_MIMES = new Set(["text/plain", "text/csv", "application/csv"]);
const OFFICE_XLSX = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const OFFICE_DOCX = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export interface CascadeInput {
  driveId: string;
  itemId: string;
  fileName: string;
  mimeType: string;
  documentId: string;
  rmaId?: string | null;
  hint?: string; // ex: "balancete", "dre", "fluxo-caixa" — usado para pré-classificar
}

export interface CascadeResult {
  ok: boolean;
  engine: string;
  raw_text: string;
  normalized_text: string;
  confidence: number;
  page_count: number;
  structure: Record<string, unknown>;
  attempts: { engine: string; ok: boolean; confidence?: number; error?: string }[];
  fromCache?: boolean;
  fileHash?: string;
  cost_estimate_usd?: number;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function normalizeText(text: string): string {
  return text
    .replace(/l(?=\d)/g, "1")
    .replace(/O(?=\d)/g, "0")
    .replace(/R\$\s?l/g, "R$ 1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Avalia se o texto extraído é "bom o suficiente" para evitar escalada
function evaluateQuality(text: string, hint?: string): number {
  if (!text) return 0;
  const len = text.trim().length;
  if (len < MIN_ACCEPT_TEXT_LENGTH) return 0.3;

  let score = 0.6 + Math.tanh(len / 4000) * 0.25; // base por densidade
  // Bônus se contém marcadores contábeis quando esperado
  if (hint && /balancete|dre|balan[çc]o|fluxo/i.test(hint)) {
    if (ACCOUNTING_HINT.test(text)) score += 0.1;
    if (/\b\d{1,3}(\.\d{3})*,\d{2}\b/.test(text)) score += 0.05; // valores BR
  }
  // Penaliza se vier com muitos caracteres "??" ou "" (OCR ruim)
  const garbage = (text.match(/[\uFFFD?]{2,}/g) || []).length;
  if (garbage > 5) score -= 0.2;
  return Math.max(0, Math.min(0.99, score));
}

async function downloadFromOneDrive(driveId: string, itemId: string): Promise<Uint8Array> {
  const token = await getAppToken();
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`Download OneDrive falhou [${r.status}] item=${itemId}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ---- Extratores diretos office/texto ----
async function extractText(bytes: Uint8Array, mime: string, fileName: string): Promise<string> {
  if (TEXT_MIMES.has(mime) || mime.startsWith("text/")) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  if (OFFICE_XLSX.has(mime) || /\.xlsx?$/i.test(fileName)) {
    const XLSX = await import("npm:xlsx@0.18.5");
    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    const parts: string[] = [];
    let total = 0;
    let dedup = 0;
    const norm = (s: string) => s.replace(/\s+/g, " ").replace(/[;,|]+$/g, "").trim().toLowerCase();
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const csv = XLSX.utils.sheet_to_csv(ws, { FS: "|", blankrows: false });
      const seen = new Set<string>();
      const out: string[] = [];
      for (const line of csv.split("\n")) {
        const key = norm(line);
        if (!key) continue;
        if (seen.has(key)) { dedup++; continue; }
        seen.add(key);
        out.push(line);
      }
      total += out.length;
      if (out.length) parts.push(`### Sheet: ${name} (${out.length} linhas, ${dedup} dup removidas)\n${out.join("\n")}`);
    }
    const joined = parts.join("\n\n");
    const max = 2 * 1024 * 1024;
    return joined.length > max ? joined.slice(0, max) + `\n[TRUNCATED rows=${total} dedup=${dedup}]` : joined;
  }
  if (OFFICE_DOCX.has(mime) || /\.docx$/i.test(fileName)) {
    const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(bytes);
    const docXml = await zip.file("word/document.xml")?.async("text");
    if (!docXml) return "";
    return docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  throw new Error(`MIME ${mime} não suportado por extratores diretos`);
}

// ---- Gemini multimodal (parametrizável) ----
async function tryGemini(
  model: string,
  bytes: Uint8Array,
  mime: string,
  fileName: string,
  documentId: string,
  rmaId?: string | null,
): Promise<{ text: string; confidence: number } | null> {
  const supportedMime = mime.includes("pdf")
    ? "application/pdf"
    : mime.startsWith("image/")
    ? mime
    : null;
  if (!supportedMime) return null;

  const b64 = bytesToB64(bytes);
  const prompt = `Você é um OCR contábil/financeiro de alta precisão. Extraia TODO o texto deste documento (${fileName}) preservando layout de tabelas, números, datas, CNPJs, valores monetários e cabeçalhos. Para colunas use ' | '. Não invente conteúdo. Retorne apenas o texto extraído.`;

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${supportedMime};base64,${b64}` } },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (resp.status === 429) throw new Error(`gemini ${model} rate-limited (429)`);
  if (resp.status === 402) throw new Error(`gemini ${model} payment required (402)`);
  if (!resp.ok) {
    throw new Error(`gemini ${model} failed [${resp.status}]: ${(await resp.text()).slice(0, 200)}`);
  }

  const data = await resp.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const usage = data?.usage ?? {};
  const tokensInput = usage.prompt_tokens ?? estimateTokens(prompt) + Math.ceil(b64.length / 4);
  const tokensOutput = usage.completion_tokens ?? estimateTokens(text);

  // Telemetria (best-effort)
  logAiUsage({
    service: modelToService(model),
    type: "ocr",
    documentId,
    rmaId,
    tokensInput,
    tokensOutput,
    model,
    metadata: { fileName, mime: supportedMime },
  }).catch(() => {});

  if (!text || text.length < 20) return null;
  const confidence = Math.min(0.98, 0.85 + Math.tanh(text.length / 5000) * 0.1);
  return { text, confidence };
}

// ---- Google Document AI (opcional, ativa se env vars setadas) ----
async function tryDocumentAi(
  bytes: Uint8Array,
  mime: string,
  documentId: string,
  rmaId?: string | null,
): Promise<{ text: string; confidence: number; pageCount: number } | null> {
  if (!DOC_AI_ENDPOINT || !DOC_AI_TOKEN) return null;
  if (!mime.includes("pdf") && !mime.startsWith("image/")) return null;

  const b64 = bytesToB64(bytes);
  const r = await fetch(DOC_AI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DOC_AI_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rawDocument: { content: b64, mimeType: mime.includes("pdf") ? "application/pdf" : mime },
    }),
  });
  if (!r.ok) {
    throw new Error(`document_ai failed [${r.status}]: ${(await r.text()).slice(0, 200)}`);
  }
  const j = await r.json();
  const text: string = j?.document?.text ?? "";
  const pageCount = j?.document?.pages?.length ?? 1;

  logAiUsage({
    service: "document_ai",
    type: "ocr",
    documentId,
    rmaId,
    pages: pageCount,
    model: "google/document-ai",
  }).catch(() => {});

  if (!text || text.length < 20) return null;
  return { text, confidence: 0.95, pageCount };
}

// ---- Google Vision fallback ----
async function tryGoogleVision(
  bytes: Uint8Array,
  mime: string,
  documentId: string,
  rmaId?: string | null,
): Promise<{ text: string; confidence: number; pageCount: number; structure: any } | null> {
  const b64 = bytesToB64(bytes);
  const r = await fetch(`${SUPABASE_URL}/functions/v1/ocr-google-vision`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileBase64: b64,
      mimeType: mime,
      documentId,
      rmaId,
      persist: false,
    }),
  });
  if (!r.ok) throw new Error(`google-vision failed [${r.status}]: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  if (j?.mode === "async") return null;

  const text = j.text || j.rawText || "";
  const pageCount = j.pageCount ?? 1;
  logAiUsage({
    service: "google_vision",
    type: "ocr",
    documentId,
    rmaId,
    pages: pageCount,
    model: "google/vision",
  }).catch(() => {});

  return {
    text,
    confidence: j.confidence ?? 0.85,
    pageCount,
    structure: j.structure ?? {},
  };
}

// ---- Persiste em ocr_results ----
// Postgres `text` columns rejeitam NUL bytes (\u0000) — alguns PDFs/Office
// devolvem texto com nulls e a inserção falha com 22P05. Sanitizamos recursivamente.
function stripNulls(value: unknown): unknown {
  if (typeof value === "string") {
    // Remove NUL e outros control chars problemáticos (mantém \n \r \t)
    return value.replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  }
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripNulls(v);
    return out;
  }
  return value;
}

async function persistOcrResult(payload: Record<string, unknown>): Promise<string> {
  const safePayload = stripNulls(payload) as Record<string, unknown>;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ocr_results`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(safePayload),
  });
  if (!r.ok) throw new Error(`persist ocr_results [${r.status}]: ${await r.text()}`);
  const rows = await r.json();
  return rows[0].id;
}


// Decide a ordem de cascata Gemini com base no hint/tipo
function buildGeminiOrder(hint?: string, fileSizeBytes?: number): string[] {
  const isHeavy = (fileSizeBytes ?? 0) > 1_500_000; // >1.5 MB
  const isComplex = hint && /balancete|dre|balan[çc]o|estoque|notas/i.test(hint);
  if (isComplex && isHeavy) {
    // Documento contábil grande → começa Flash (Lite pode falhar em layout denso)
    return ["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite", "google/gemini-2.5-pro"];
  }
  // Default cheap-first
  return ["google/gemini-2.5-flash-lite", "google/gemini-2.5-flash", "google/gemini-2.5-pro"];
}

// ---- Pipeline público ----
export async function runOcrCascade(input: CascadeInput): Promise<CascadeResult> {
  const attempts: CascadeResult["attempts"] = [];
  const bytes = await downloadFromOneDrive(input.driveId, input.itemId);
  const fileHash = await sha256Hex(bytes);

  // Cache lookup
  const cached = await lookupOcrCache(fileHash);
  if (cached?.raw_text) {
    await persistOcrResult({
      document_id: input.documentId,
      rma_id: input.rmaId ?? null,
      engine: cached.engine,
      status: "completed",
      progress: 100,
      raw_text: cached.raw_text,
      normalized_text: cached.normalized_text,
      confidence: cached.confidence,
      structure: cached.structured_blocks,
      page_count: cached.page_count,
      pages_total: cached.page_count,
      pages_processed: cached.page_count,
    });
    // Embeddings também no cache hit (idempotente — pula se já existir)
    generateEmbeddings({
      documentId: input.documentId,
      rmaId: input.rmaId,
      classe: input.hint,
      path: input.fileName,
      text: cached.normalized_text,
    }).catch((e) => console.error("[embeddings cache-hit] failed:", e));
    return {
      ok: true,
      engine: cached.engine,
      raw_text: cached.raw_text,
      normalized_text: cached.normalized_text,
      confidence: cached.confidence,
      page_count: cached.page_count,
      structure: cached.structured_blocks ?? {},
      attempts: [{ engine: "cache", ok: true }],
      fromCache: true,
      fileHash,
      cost_estimate_usd: 0,
    };
  }

  const mime = (input.mimeType || "").toLowerCase();
  const isPdfOrImage = mime.includes("pdf") || mime.startsWith("image/");
  const isOfficeOrText = TEXT_MIMES.has(mime) || OFFICE_XLSX.has(mime) || OFFICE_DOCX.has(mime)
    || mime.startsWith("text/") || /\.(xlsx?|docx|csv|txt)$/i.test(input.fileName);

  let raw = "";
  let confidence = 0;
  let engine = "none";
  let pageCount = 1;

  // ===== Estratégia 1: Extratores diretos =====
  if (isOfficeOrText) {
    try {
      raw = await extractText(bytes, mime, input.fileName);
      const q = evaluateQuality(raw, input.hint);
      attempts.push({ engine: "office-direct", ok: !!raw, confidence: q });
      if (raw && q >= MIN_ACCEPT_CONFIDENCE_OFFICE) {
        engine = OFFICE_XLSX.has(mime) ? "xlsx-direct"
          : OFFICE_DOCX.has(mime) ? "docx-direct" : "text-direct";
        confidence = Math.max(0.9, q);
      } else {
        raw = ""; // não atingiu qualidade — escala
      }
    } catch (e) {
      attempts.push({ engine: "office-direct", ok: false, error: String(e).slice(0, 200) });
    }
  }

  // ===== Estratégia 2: Gemini cascade CHEAP-FIRST =====
  if (!raw && isPdfOrImage) {
    const order = buildGeminiOrder(input.hint, bytes.byteLength);
    for (const model of order) {
      try {
        const out = await tryGemini(model, bytes, mime, input.fileName, input.documentId, input.rmaId);
        const q = out ? evaluateQuality(out.text, input.hint) : 0;
        attempts.push({ engine: model, ok: !!out, confidence: q, error: out ? undefined : "empty" });
        if (out && q >= MIN_ACCEPT_CONFIDENCE) {
          raw = out.text;
          confidence = Math.max(out.confidence, q);
          engine = model;
          break;
        }
      } catch (e) {
        attempts.push({ engine: model, ok: false, error: String(e).slice(0, 200) });
      }
    }
  }

  // ===== Estratégia 3: Document AI (se configurado) — bom para PDFs estruturados =====
  if (!raw && isPdfOrImage) {
    try {
      const out = await tryDocumentAi(bytes, mime, input.documentId, input.rmaId);
      if (out?.text) {
        raw = out.text;
        confidence = out.confidence;
        pageCount = out.pageCount;
        engine = "document_ai";
        attempts.push({ engine: "document_ai", ok: true, confidence });
      } else {
        attempts.push({ engine: "document_ai", ok: false, error: "not-configured-or-empty" });
      }
    } catch (e) {
      attempts.push({ engine: "document_ai", ok: false, error: String(e).slice(0, 200) });
    }
  }

  // ===== Estratégia 4: Google Vision (último fallback) =====
  if (!raw && isPdfOrImage) {
    try {
      const out = await tryGoogleVision(bytes, mime, input.documentId, input.rmaId);
      if (out?.text) {
        raw = out.text;
        confidence = out.confidence;
        pageCount = out.pageCount;
        engine = "google_vision";
        attempts.push({ engine: "google_vision", ok: true, confidence });
      } else {
        attempts.push({ engine: "google_vision", ok: false, error: out ? "empty" : "async-skipped" });
      }
    } catch (e) {
      attempts.push({ engine: "google_vision", ok: false, error: String(e).slice(0, 200) });
    }
  }

  if (!raw) {
    return {
      ok: false,
      engine,
      raw_text: "",
      normalized_text: "",
      confidence: 0,
      page_count: 0,
      structure: {},
      attempts,
      fileHash,
    };
  }

  const normalized = normalizeText(raw);
  const structure = { lines: normalized.split(/\n+/).filter(Boolean).slice(0, 5000) };

  await persistOcrResult({
    document_id: input.documentId,
    rma_id: input.rmaId ?? null,
    engine,
    status: "completed",
    progress: 100,
    raw_text: raw,
    normalized_text: normalized,
    confidence,
    structure,
    page_count: pageCount,
    pages_total: pageCount,
    pages_processed: pageCount,
  });

  storeOcrCache(fileHash, {
    raw_text: raw,
    normalized_text: normalized,
    structured_blocks: structure,
    page_count: pageCount,
    confidence,
    engine,
  }).catch((e) => console.error("storeOcrCache failed:", e));

  // Gera embeddings 768D (best-effort — não bloqueia o pipeline OCR)
  generateEmbeddings({
    documentId: input.documentId,
    rmaId: input.rmaId,
    classe: input.hint,
    path: input.fileName,
    text: normalized,
  })
    .then((r) => console.log(`[embeddings] doc=${input.documentId} engine=${r.engine} chunks=${r.chunks} ok=${r.ok}`))
    .catch((e) => console.error("[embeddings] failed:", e));

  return {
    ok: true,
    engine,
    raw_text: raw,
    normalized_text: normalized,
    confidence,
    page_count: pageCount,
    structure,
    attempts,
    fileHash,
  };
}

export async function hasCompletedOcr(documentId: string): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/ocr_results?document_id=eq.${documentId}&status=eq.completed&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}
