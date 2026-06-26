// RAG Retriever — Memória Vetorial + Re-ranking Context-Aware (RMA)
// MD: Memória Vetorial + RAG (Context-Aware Ranking)
//
// 3 camadas de memória, todas em company_memory_embeddings (filtradas por `tipo`):
//   - structural   → planos de contas, estrutura balancete (peso 1.5x base)
//   - semantic     → variações de nomes, sinônimos (peso 1.0x base)
//   - operational  → erros/correções/ajustes (peso 1.2x base)
//
// Fluxo:
//   1. embedQuery(text) → vetor 768D
//   2. match_company_memory(...) por empresa (RPC com cosine similarity * weight)
//   3. rankContexts: similarity*0.40 + recency*0.25 + frequency*0.20 + confidence*0.15
//   4. retorna top-K (default 5; topK dinâmico por complexidade do texto)
//   5. indexContext: persiste novo aprendizado (upsert determinístico via SHA-256)

import { createClient } from "npm:@supabase/supabase-js@2";
import { embedQuery } from "./embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type MemoryTipo =
  | "regra"
  | "padrao"
  | "comportamento"
  | "erro"
  | "contexto_documento"
  | "structural"
  | "semantic"
  | "operational";

export interface RagHit {
  id: string;
  tipo: string;
  conteudo: string;
  similarity: number;
  weight: number;
  // re-rank metadata
  recencyScore?: number;
  frequencyScore?: number;
  confidenceScore?: number;
  finalScore?: number;
}

export interface RagRetrieveOptions {
  companyId: string;
  text: string;
  topK?: number;          // default: dinâmico (3..10)
  threshold?: number;     // default 0.65
  tipos?: MemoryTipo[];   // filtro opcional
}

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

// ---------- Helpers de scoring ----------
function recencyScore(createdAt?: string | null): number {
  if (!createdAt) return 0.3;
  const days = Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 86400_000);
  // 1.0 se hoje, ~0.5 em 60 dias, ~0.1 em 365 dias (decaimento exponencial)
  return Math.exp(-days / 90);
}

function frequencyScore(weight?: number): number {
  // weight cresce com reforço; clamp 0..1 (peso 5.0 → 1.0)
  return Math.min(1, Math.max(0, (weight ?? 1) / 5));
}

function confidenceScore(weight?: number, similarity?: number): number {
  // proxy: weight alto + similarity alta = confiança histórica
  return Math.min(1, ((weight ?? 1) / 5) * 0.5 + (similarity ?? 0) * 0.5);
}

function tipoBoost(tipo: string): number {
  if (tipo === "structural" || tipo === "regra" || tipo === "padrao") return 1.5;
  if (tipo === "operational" || tipo === "erro") return 1.2;
  return 1.0;
}

// Top-K dinâmico baseado na complexidade do texto
function dynamicTopK(text: string, override?: number): number {
  if (override) return Math.min(10, Math.max(1, override));
  const len = (text || "").length;
  if (len < 800) return 3;
  if (len < 4000) return 5;
  return 10;
}

// ---------- Re-ranking ----------
export function rankContexts(hits: RagHit[]): RagHit[] {
  const enriched = hits.map((h) => {
    const rec = recencyScore((h as any).created_at);
    const freq = frequencyScore(h.weight);
    const conf = confidenceScore(h.weight, h.similarity);
    const base =
      h.similarity * 0.40 +
      rec * 0.25 +
      freq * 0.20 +
      conf * 0.15;
    const finalScore = base * tipoBoost(h.tipo);
    return { ...h, recencyScore: rec, frequencyScore: freq, confidenceScore: conf, finalScore };
  });
  enriched.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
  return enriched;
}

// ---------- Retrieve principal ----------
export async function ragRetrieve(opts: RagRetrieveOptions): Promise<{
  hits: RagHit[];
  topK: number;
  threshold: number;
  embedded: boolean;
}> {
  const threshold = opts.threshold ?? 0.65;
  const topK = dynamicTopK(opts.text, opts.topK);
  const vec = await embedQuery(opts.text);
  if (!vec) {
    return { hits: [], topK, threshold, embedded: false };
  }

  // Pega 3x topK para ter material para re-rankear
  const { data, error } = await sb().rpc("match_company_memory", {
    query_embedding: `[${vec.join(",")}]`,
    target_company_id: opts.companyId,
    match_threshold: threshold,
    match_count: topK * 3,
  });
  if (error) {
    console.warn("[rag-retriever] match_company_memory error:", error.message);
    return { hits: [], topK, threshold, embedded: true };
  }

  let raw: RagHit[] = (data ?? []) as RagHit[];
  if (opts.tipos && opts.tipos.length > 0) {
    raw = raw.filter((h) => opts.tipos!.includes(h.tipo as MemoryTipo));
  }

  const ranked = rankContexts(raw).slice(0, topK);
  return { hits: ranked, topK, threshold, embedded: true };
}

// ---------- Builder de bloco para o prompt ----------
export function ragContextsToPromptBlock(hits: RagHit[]): string {
  if (!hits || hits.length === 0) {
    return "[CONTEXTO RAG]\nNenhum contexto histórico relevante encontrado para esta empresa.";
  }
  const lines = hits.map((h, i) => {
    const score = (h.finalScore ?? h.similarity).toFixed(3);
    const conteudo = h.conteudo.length > 400 ? h.conteudo.slice(0, 400) + "..." : h.conteudo;
    return `${i + 1}. [${h.tipo} | score=${score}] ${conteudo}`;
  });
  return [
    "[CONTEXTO RAG — evidências reais do histórico da empresa]",
    "USE APENAS este contexto + o documento atual. Se não houver evidência, retorne null.",
    ...lines,
  ].join("\n");
}

// ---------- Indexação ----------
export interface IndexInput {
  companyId: string;
  rmaId?: string | null;
  tipo: MemoryTipo;
  conteudo: string;
  weight?: number;          // default 1.0
  source?: string;          // default 'rag-indexer'
  documentId?: string | null;
  extractionId?: string | null;
}

export async function indexContext(input: IndexInput): Promise<{ ok: boolean; id?: string; cached?: boolean; error?: string }> {
  if (!input.companyId || !input.conteudo?.trim()) {
    return { ok: false, error: "companyId and conteudo required" };
  }

  // Dedup determinístico: mesmo (company, tipo, conteudo) não duplica
  const dedupHash = await sha256Hex(`${input.companyId}|${input.tipo}|${input.conteudo.trim()}`);
  const { data: existing } = await sb()
    .from("company_memory_embeddings")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("tipo", input.tipo)
    .ilike("source", `%${dedupHash.slice(0, 16)}%`)
    .maybeSingle();
  if (existing?.id) return { ok: true, id: existing.id, cached: true };

  const vec = await embedQuery(input.conteudo);
  if (!vec) return { ok: false, error: "embedding unavailable" };

  const { data, error } = await sb()
    .from("company_memory_embeddings")
    .insert({
      company_id: input.companyId,
      rma_id: input.rmaId ?? null,
      tipo: input.tipo,
      conteudo: input.conteudo.trim(),
      embedding: `[${vec.join(",")}]`,
      weight: input.weight ?? 1.0,
      source: `${input.source ?? "rag-indexer"}#${dedupHash.slice(0, 16)}`,
      document_id: input.documentId ?? null,
      extraction_id: input.extractionId ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data!.id };
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
