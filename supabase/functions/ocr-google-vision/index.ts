// OCR Google Vision (Produção) — síncrono e assíncrono em lote
// - Sync: imagens e PDFs até 5 páginas via files:annotate
// - Async: PDFs >5 páginas → split via pdf-lib em chunks de 5, processo em background
//   com EdgeRuntime.waitUntil, atualizando status/progress em ocr_results

import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1?target=deno";
import { generateEmbedding } from "../_shared/vertex-embeddings.ts";
import { generateEmbeddings as generateEmbeddingsPipeline } from "../_shared/embeddings.ts";
import { lookupOcrCache, sha256Hex, storeOcrCache } from "../_shared/ocr-cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_SYNC_PAGE_LIMIT = 5;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

type VisionAuth =
  | { kind: "oauth"; sa: ServiceAccount }
  | { kind: "apiKey"; apiKey: string };

/**
 * Aceita dois formatos no segredo GOOGLE_VISION_CREDENTIALS:
 *  1. JSON da Service Account (recomendado — habilita modo async/batch)
 *  2. API key string (ex: "AIzaSy..."), suporta apenas chamadas síncronas
 */
function parseVisionCredentials(raw: string): VisionAuth {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const sa = JSON.parse(trimmed) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) {
      throw new Error("Service Account JSON inválida (faltam client_email/private_key)");
    }
    return { kind: "oauth", sa };
  }
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed)) {
    return { kind: "apiKey", apiKey: trimmed };
  }
  throw new Error(
    "GOOGLE_VISION_CREDENTIALS inválida: forneça o JSON completo da Service Account ou uma API key começando com 'AIza...'",
  );
}

interface OcrRequest {
  fileBase64?: string;
  fileUrl?: string;
  mimeType?: string;
  documentId?: string;
  rmaId?: string;
  persist?: boolean;
  async?: boolean; // força modo assíncrono
}

// ===== Auth =====
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let cachedToken: { token: string; expiresAt: number } | null = null;
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const key = await importPrivateKey(sa.private_key);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      exp: getNumericDate(3600),
      iat: getNumericDate(0),
    },
    key,
  );
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`OAuth token failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

// ===== Helpers =====
function normalizeText(text: string): string {
  return text
    .replace(/l(?=\d)/g, "1")
    .replace(/O(?=\d)/g, "0")
    .replace(/R\$\s?l/g, "R$ 1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractLines(pages: any[]): string[] {
  const lines: string[] = [];
  for (const page of pages || []) {
    for (const block of page.blocks || []) {
      for (const para of block.paragraphs || []) {
        let line = "";
        for (const word of para.words || []) {
          line += (word.symbols || []).map((s: any) => s.text).join("") + " ";
        }
        const t = line.trim();
        if (t) lines.push(t);
      }
    }
  }
  return lines;
}

function summarizeStructure(pages: any[]) {
  let blocks = 0, paragraphs = 0, words = 0;
  for (const page of pages || []) {
    for (const block of page.blocks || []) {
      blocks++;
      for (const para of block.paragraphs || []) {
        paragraphs++;
        words += (para.words || []).length;
      }
    }
  }
  return { blocks, paragraphs, words, lines: extractLines(pages) };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ===== Vision call (sync, ≤5 páginas / 1 imagem) =====
async function callVisionSync(
  auth: VisionAuth,
  contentBase64: string,
  mimeType: string,
  pages?: number[],
) {
  const isPdf = (mimeType || "").includes("pdf");
  const body = isPdf
    ? {
        requests: [
          {
            inputConfig: { content: contentBase64, mimeType: "application/pdf" },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            pages: pages || [1, 2, 3, 4, 5],
          },
        ],
      }
    : {
        requests: [
          {
            image: { content: contentBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      };
  let endpoint = isPdf
    ? "https://vision.googleapis.com/v1/files:annotate"
    : "https://vision.googleapis.com/v1/images:annotate";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth.kind === "oauth") {
    const accessToken = await getAccessToken(auth.sa);
    headers.Authorization = `Bearer ${accessToken}`;
  } else {
    endpoint += `?key=${encodeURIComponent(auth.apiKey)}`;
  }

  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Vision API failed [${res.status}]: ${await res.text()}`);
  const json = await res.json();

  if (isPdf) {
    const fileResponses = json.responses?.[0]?.responses || [];
    const allPages: any[] = [];
    let fullText = "";
    for (const r of fileResponses) {
      if (r.fullTextAnnotation?.text) fullText += r.fullTextAnnotation.text + "\n";
      if (r.fullTextAnnotation?.pages) allPages.push(...r.fullTextAnnotation.pages);
    }
    return { fullText, pages: allPages };
  } else {
    const r = json.responses?.[0];
    return {
      fullText: r?.fullTextAnnotation?.text || "",
      pages: r?.fullTextAnnotation?.pages || [],
    };
  }
}

// ===== Supabase REST helpers =====
async function dbInsert(payload: Record<string, unknown>): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ocr_results`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Insert ocr_results failed [${r.status}]: ${await r.text()}`);
  const rows = await r.json();
  return rows[0].id;
}

async function dbUpdate(id: string, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ocr_results?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) console.error(`Update ocr_results ${id} failed:`, await r.text());
}

// Gera embeddings (chunked, 768D) via pipeline unificado (Gemini direto → Gateway → Vertex).
// Persiste em ocr_embeddings (sempre) e document_embeddings (se houver doc na pipeline_documents).
// Best-effort: nunca lança nem bloqueia o OCR.
async function persistOcrEmbedding(opts: {
  documentId?: string;
  ocrResultId?: string;
  rmaId?: string;
  text: string;
  normalizedText: string;
}): Promise<void> {
  if (!opts.documentId) return; // sem documentId não conseguimos rastrear
  try {
    const out = await generateEmbeddingsPipeline({
      documentId: opts.documentId,
      ocrResultId: opts.ocrResultId ?? null,
      rmaId: opts.rmaId ?? null,
      text: opts.normalizedText || opts.text,
    });
    if (!out.ok) {
      console.warn("[ocr-google-vision] embeddings skipped:", out.engine, out.error);
    } else {
      console.log(
        `[ocr-google-vision] embeddings ok (${out.engine}): chunks=${out.chunks} ocr=${out.inserted.ocr_embeddings} doc=${out.inserted.document_embeddings}`,
      );
    }
  } catch (e) {
    console.error("persistOcrEmbedding erro:", e);
  }
}

// ===== PDF split =====
async function splitPdfIntoChunks(pdfBytes: Uint8Array, chunkSize: number) {
  const src = await PDFDocument.load(pdfBytes);
  const total = src.getPageCount();
  const chunks: { base64: string; pageRange: [number, number] }[] = [];
  for (let start = 0; start < total; start += chunkSize) {
    const end = Math.min(start + chunkSize, total);
    const dst = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const copied = await dst.copyPages(src, indices);
    copied.forEach((p) => dst.addPage(p));
    const bytes = await dst.save();
    chunks.push({ base64: bytesToBase64(bytes), pageRange: [start + 1, end] });
  }
  return { total, chunks };
}

// ===== Background async pipeline =====
async function runAsyncPipeline(
  resultId: string,
  auth: VisionAuth,
  pdfBytes: Uint8Array,
  documentId: string | undefined,
  rmaId: string | undefined,
) {
  try {
    const { total, chunks } = await splitPdfIntoChunks(pdfBytes, VISION_SYNC_PAGE_LIMIT);
    await dbUpdate(resultId, { pages_total: total, status: "processing" });

    let fullText = "";
    const allPages: any[] = [];
    let processed = 0;
    let avgConfidence = 0;
    let confSamples = 0;

    for (const chunk of chunks) {
      const { fullText: t, pages } = await callVisionSync(
        auth,
        chunk.base64,
        "application/pdf",
      );
      if (t) fullText += t + "\n";
      if (pages?.length) {
        allPages.push(...pages);
        for (const p of pages) {
          if (typeof p.confidence === "number") {
            avgConfidence += p.confidence;
            confSamples++;
          }
        }
      }
      processed = chunk.pageRange[1];
      const progress = Math.round((processed / total) * 100);
      await dbUpdate(resultId, {
        pages_processed: processed,
        progress,
        // salva parcial para feedback ao usuário
        raw_text: fullText,
      });
    }

    const normalized = normalizeText(fullText);
    const structure = summarizeStructure(allPages);
    const confidence = confSamples > 0 ? avgConfidence / confSamples : 0.9;

    await dbUpdate(resultId, {
      status: "completed",
      progress: 100,
      pages_processed: total,
      raw_text: fullText,
      normalized_text: normalized,
      confidence,
      structure,
      page_count: total,
    });

    // Embedding semântico (best-effort)
    await persistOcrEmbedding({
      documentId,
      ocrResultId: resultId,
      rmaId,
      text: fullText,
      normalizedText: normalized,
    });
  } catch (e) {
    console.error("async pipeline error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    await dbUpdate(resultId, { status: "failed", error_message: msg });
  }
}

// ===== Handler =====
// @ts-ignore - EdgeRuntime is provided by Supabase
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET status?id=...
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("id")) {
    const id = url.searchParams.get("id")!;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ocr_results?id=eq.${id}&select=id,status,progress,pages_processed,pages_total,confidence,error_message,page_count`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    const rows = await r.json();
    return new Response(JSON.stringify(rows[0] || { error: "not found" }), {
      status: rows[0] ? 200 : 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const credsRaw = Deno.env.get("GOOGLE_VISION_CREDENTIALS");
    if (!credsRaw) throw new Error("GOOGLE_VISION_CREDENTIALS não configurada");
    const auth = parseVisionCredentials(credsRaw);

    const body = (await req.json()) as OcrRequest;
    let contentBase64 = body.fileBase64;
    let mimeType = body.mimeType || "image/png";

    if (!contentBase64 && body.fileUrl) {
      const r = await fetch(body.fileUrl);
      if (!r.ok) throw new Error(`Falha ao baixar fileUrl [${r.status}]`);
      contentBase64 = bytesToBase64(new Uint8Array(await r.arrayBuffer()));
      mimeType = r.headers.get("content-type") || mimeType;
    }
    if (!contentBase64) {
      return new Response(JSON.stringify({ error: "fileBase64 ou fileUrl obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPdf = mimeType.includes("pdf");

    // ----- OCR CACHE LOOKUP (Phase 2) -----
    // Hash file bytes; reuse cached OCR if available, skipping Google Vision entirely.
    const fileBytes = base64ToBytes(contentBase64);
    const fileHash = await sha256Hex(fileBytes);
    const cached = await lookupOcrCache(fileHash);
    if (cached && cached.raw_text) {
      let cacheResultId: string | undefined;
      if (body.persist && body.documentId) {
        cacheResultId = await dbInsert({
          document_id: body.documentId,
          rma_id: body.rmaId || null,
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
      }
      return new Response(
        JSON.stringify({
          mode: "cache",
          resultId: cacheResultId,
          text: cached.normalized_text,
          rawText: cached.raw_text,
          confidence: cached.confidence,
          pageCount: cached.page_count,
          structure: cached.structured_blocks,
          fromCache: true,
          fileHash,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Detecta total de páginas se for PDF
    let pdfBytes: Uint8Array | null = null;
    let totalPages = 1;
    if (isPdf) {
      pdfBytes = fileBytes;
      const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      totalPages = doc.getPageCount();
    }

    const needsAsync = body.async === true || (isPdf && totalPages > VISION_SYNC_PAGE_LIMIT);

    // ----- Modo ASSÍNCRONO -----
    if (needsAsync && pdfBytes) {
      const resultId = await dbInsert({
        document_id: body.documentId || "00000000-0000-0000-0000-000000000000",
        rma_id: body.rmaId || null,
        engine: "google_vision",
        status: "pending",
        progress: 0,
        pages_total: totalPages,
        pages_processed: 0,
      });

      EdgeRuntime.waitUntil(
        runAsyncPipeline(resultId, auth, pdfBytes, body.documentId, body.rmaId),
      );

      return new Response(
        JSON.stringify({
          mode: "async",
          resultId,
          status: "pending",
          pagesTotal: totalPages,
          pollUrl: `/functions/v1/ocr-google-vision?id=${resultId}`,
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ----- Modo SÍNCRONO -----
    const t0 = Date.now();
    const { fullText, pages } = await callVisionSync(auth, contentBase64, mimeType);
    const duration = Date.now() - t0;
    const normalized = normalizeText(fullText);
    const structure = summarizeStructure(pages);
    const confidence = pages?.[0]?.confidence ?? 0.9;

    let resultId: string | undefined;
    if (body.persist && body.documentId) {
      resultId = await dbInsert({
        document_id: body.documentId,
        rma_id: body.rmaId || null,
        engine: "google_vision",
        status: "completed",
        progress: 100,
        raw_text: fullText,
        normalized_text: normalized,
        confidence,
        structure,
        page_count: pages?.length || 1,
        pages_total: pages?.length || 1,
        pages_processed: pages?.length || 1,
      });
    }

    // Embedding semântico (best-effort, sync mode) — sempre que houver documentId
    if (body.documentId) {
      await persistOcrEmbedding({
        documentId: body.documentId,
        ocrResultId: resultId,
        rmaId: body.rmaId,
        text: fullText,
        normalizedText: normalized,
      });
    }

    // Persist OCR cache (Phase 2) — best-effort
    storeOcrCache(fileHash, {
      raw_text: fullText,
      normalized_text: normalized,
      structured_blocks: structure,
      page_count: pages?.length || 1,
      confidence,
      engine: "google_vision",
    }).catch((e) => console.error("storeOcrCache failed", e));

    return new Response(
      JSON.stringify({
        mode: "sync",
        resultId,
        text: normalized,
        rawText: fullText,
        confidence,
        pageCount: pages?.length || 1,
        structure,
        durationMs: duration,
        fileHash,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ocr-google-vision error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
