// Embeddings 768D via Gemini text-embedding-004.
//
// Estratégia:
//   1. Se GOOGLE_AI_API_KEY estiver setada → API direta do Gemini (recomendado).
//   2. Senão → tenta gateway Lovable (/v1/embeddings) com modelo google/text-embedding-004.
//   3. Se ambas falharem → retorna [] (não bloqueia o pipeline OCR).
//
// Persiste em duas tabelas:
//   - document_embeddings: 1 linha por chunk (busca por documento)
//   - ocr_embeddings: 1 linha por chunk com classe/agent/path (busca semântica RMA)
//
// Telemetria registrada em ai_usage_logs como service='embedding'.

import { logAiUsage } from "./ai-telemetry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";

const MODEL = "gemini-embedding-001";
const DIMENSIONS = 768;
const MAX_CHARS_PER_CHUNK = 2000;     // ~500 tokens
const CHUNK_OVERLAP = 200;            // sobreposição p/ contexto
const MAX_CHUNKS_PER_DOC = 60;        // teto para evitar custos absurdos

export interface EmbeddingInput {
  documentId: string;
  rmaId?: string | null;
  classe?: string | null;
  agent?: string | null;
  path?: string | null;
  ocrResultId?: string | null;
  text: string;
}

export interface EmbeddingOutput {
  ok: boolean;
  chunks: number;
  inserted: { document_embeddings: number; ocr_embeddings: number };
  engine: string;
  error?: string;
}

// ---- Chunking inteligente: respeita parágrafos e linhas ----
export function chunkText(text: string, maxChars = MAX_CHARS_PER_CHUNK, overlap = CHUNK_OVERLAP): string[] {
  if (!text) return [];
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const chunks: string[] = [];
  // Quebra por parágrafos primeiro
  const paragraphs = cleaned.split(/\n{2,}/);
  let buffer = "";

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) chunks.push(trimmed);
    buffer = "";
  };

  for (const p of paragraphs) {
    if ((buffer + "\n\n" + p).length > maxChars) {
      flush();
      // Se o parágrafo único já é maior que maxChars, quebra por linhas/sentenças
      if (p.length > maxChars) {
        const lines = p.split(/\n|(?<=[.!?])\s+/);
        for (const line of lines) {
          if ((buffer + " " + line).length > maxChars) {
            flush();
          }
          buffer += (buffer ? " " : "") + line;
        }
        flush();
      } else {
        buffer = p;
      }
    } else {
      buffer += (buffer ? "\n\n" : "") + p;
    }
  }
  flush();

  // Aplica overlap sliding
  if (overlap > 0 && chunks.length > 1) {
    const withOverlap: string[] = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].slice(-overlap);
      withOverlap.push(prevTail + "\n" + chunks[i]);
    }
    return withOverlap.slice(0, MAX_CHUNKS_PER_DOC);
  }
  return chunks.slice(0, MAX_CHUNKS_PER_DOC);
}

// ---- Estratégia 1: Gemini API direta (gemini-embedding-001 — 1 request por chunk) ----
async function embedOne(text: string): Promise<number[] | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${GOOGLE_AI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: DIMENSIONS,
      taskType: "RETRIEVAL_DOCUMENT",
    }),
  });
  if (!r.ok) {
    console.error("[embeddings] gemini embedContent failed:", r.status, (await r.text()).slice(0, 800));
    return null;
  }
  const j = await r.json();
  return j?.embedding?.values ?? null;
}

async function embedViaGemini(texts: string[]): Promise<number[][] | null> {
  if (!GOOGLE_AI_API_KEY) return null;
  // Concorrência controlada (até 5 em paralelo) para evitar rate limit
  const out: (number[] | null)[] = new Array(texts.length).fill(null);
  const CONCURRENCY = 5;
  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch = texts.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((t) => embedOne(t)));
    results.forEach((v, k) => (out[i + k] = v));
  }
  if (out.some((v) => !v || v.length !== DIMENSIONS)) return null;
  return out as number[][];
}

// ---- Estratégia 2: Lovable Gateway /v1/embeddings ----
async function embedViaGateway(texts: string[]): Promise<number[][] | null> {
  if (!LOVABLE_API_KEY) return null;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: `google/${MODEL}`,
      input: texts,
    }),
  });
  if (!r.ok) {
    console.error("[embeddings] gateway failed:", r.status, (await r.text()).slice(0, 300));
    return null;
  }
  const j = await r.json();
  try {
    const { logEmbeddingUsage } = await import("./ai-telemetry.ts");
    logEmbeddingUsage(j, { model: `google/${MODEL}`, inputCount: texts.length, metadata: { fn: "embeddings.gateway" } }).catch(() => {});
  } catch (_) { /* noop */ }
  const out: number[][] = (j?.data || []).map((e: any) => e?.embedding || []);
  return out.length === texts.length ? out : null;
}

async function embed(texts: string[]): Promise<{ vectors: number[][]; engine: string } | null> {
  // Tenta direto, depois gateway
  const direct = await embedViaGemini(texts);
  if (direct) return { vectors: direct, engine: "gemini-direct" };
  const gw = await embedViaGateway(texts);
  if (gw) return { vectors: gw, engine: "lovable-gateway" };
  return null;
}

// ---- Persistência em lote ----
async function bulkInsert(table: string, rows: Record<string, unknown>[]): Promise<number> {
  if (!rows.length) return 0;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    console.error(`[embeddings] insert ${table} failed:`, r.status, (await r.text()).slice(0, 300));
    return 0;
  }
  return rows.length;
}

// Verifica se documento existe em pipeline_documents (FK do document_embeddings)
async function pipelineDocExists(documentId: string): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/pipeline_documents?id=eq.${documentId}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

// Verifica se já existem embeddings para este documento (idempotência)
async function alreadyEmbedded(documentId: string): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/document_embeddings?document_id=eq.${documentId}&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

// ---- Pipeline público ----
export async function generateEmbeddings(input: EmbeddingInput): Promise<EmbeddingOutput> {
  const text = (input.text || "").trim();
  if (!text || text.length < 30) {
    return { ok: false, chunks: 0, inserted: { document_embeddings: 0, ocr_embeddings: 0 }, engine: "skipped", error: "text too short" };
  }

  // Idempotência: não regera se já existe
  if (await alreadyEmbedded(input.documentId)) {
    return { ok: true, chunks: 0, inserted: { document_embeddings: 0, ocr_embeddings: 0 }, engine: "cached" };
  }

  const chunks = chunkText(text);
  if (!chunks.length) {
    return { ok: false, chunks: 0, inserted: { document_embeddings: 0, ocr_embeddings: 0 }, engine: "skipped", error: "no chunks" };
  }

  const result = await embed(chunks);
  if (!result) {
    return {
      ok: false,
      chunks: chunks.length,
      inserted: { document_embeddings: 0, ocr_embeddings: 0 },
      engine: "none",
      error: "embedding API unavailable (set GOOGLE_AI_API_KEY)",
    };
  }
  const { vectors, engine } = result;

  // Telemetria (estimativa: ~1 token por 4 chars)
  const totalChars = chunks.reduce((s, c) => s + c.length, 0);
  logAiUsage({
    service: "embedding",
    type: "embedding",
    documentId: input.documentId,
    rmaId: input.rmaId,
    tokensInput: Math.ceil(totalChars / 4),
    requests: chunks.length,
    model: MODEL,
    metadata: { engine, classe: input.classe, chunks: chunks.length },
  }).catch(() => {});

  // Persiste em ocr_embeddings (sempre, sem FK)
  const ocrRows = chunks.map((chunk, i) => ({
    document_id: input.documentId,
    ocr_result_id: input.ocrResultId ?? null,
    rma_id: input.rmaId ?? null,
    classe: input.classe ?? null,
    agent: input.agent ?? null,
    path: input.path ?? null,
    text: chunk,
    normalized_text: chunk,
    embedding: `[${vectors[i].join(",")}]`,
    source: "pipeline",
  }));
  const ocrInserted = await bulkInsert("ocr_embeddings", ocrRows);

  // Persiste em document_embeddings só se documento existe em pipeline_documents
  let docInserted = 0;
  if (await pipelineDocExists(input.documentId)) {
    const docRows = chunks.map((chunk, i) => ({
      document_id: input.documentId,
      chunk_index: i,
      chunk_text: chunk,
      embedding: `[${vectors[i].join(",")}]`,
      rma_id: input.rmaId ?? "",
    }));
    docInserted = await bulkInsert("document_embeddings", docRows);
  }

  return {
    ok: true,
    chunks: chunks.length,
    inserted: { document_embeddings: docInserted, ocr_embeddings: ocrInserted },
    engine,
  };
}

// Helper para query single (usado por search functions externas)
export async function embedQuery(text: string): Promise<number[] | null> {
  const r = await embed([text]);
  return r ? r.vectors[0] : null;
}
