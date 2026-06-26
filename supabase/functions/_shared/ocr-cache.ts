// OCR cache helpers — Phase 2
// Lookup/store OCR results by SHA-256 of file bytes to avoid reprocessing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

/**
 * Compute SHA-256 hash (hex) of bytes — used as cache key.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface CachedOcr {
  raw_text: string | null;
  normalized_text: string | null;
  structured_blocks: Record<string, unknown>;
  page_count: number | null;
  confidence: number | null;
  engine: string;
}

/**
 * Try to read OCR from cache; bumps hits/last_used_at if found.
 */
export async function lookupOcrCache(file_hash: string): Promise<CachedOcr | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("ocr_cache")
    .select("raw_text,normalized_text,structured_blocks,page_count,confidence,engine,hits")
    .eq("file_hash", file_hash)
    .maybeSingle();
  if (!data) return null;

  // Best-effort hit counter (don't await to keep latency low)
  sb.from("ocr_cache").update({
    hits: (data.hits ?? 1) + 1,
    last_used_at: new Date().toISOString(),
  }).eq("file_hash", file_hash).then(() => {}, () => {});

  return {
    raw_text: data.raw_text,
    normalized_text: data.normalized_text,
    structured_blocks: data.structured_blocks ?? {},
    page_count: data.page_count,
    confidence: data.confidence,
    engine: data.engine,
  };
}

/**
 * Persist OCR result to cache (upsert by file_hash).
 */
export async function storeOcrCache(file_hash: string, payload: CachedOcr): Promise<void> {
  const sb = getServiceClient();
  await sb.from("ocr_cache").upsert({
    file_hash,
    raw_text: payload.raw_text,
    normalized_text: payload.normalized_text,
    structured_blocks: payload.structured_blocks ?? {},
    page_count: payload.page_count,
    confidence: payload.confidence,
    engine: payload.engine ?? "google_vision",
    last_used_at: new Date().toISOString(),
  }, { onConflict: "file_hash" });
}
