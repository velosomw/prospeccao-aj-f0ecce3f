// Busca semântica em ocr_embeddings — usado pelo RMA Workspace.
//
// POST { query: string, rmaId?: string, classe?: string, threshold?: number, limit?: number }
// → { hits: [{ document_id, classe, path, text, similarity }] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { embedQuery } from "../_shared/embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    if (!query || query.length < 3) {
      return new Response(JSON.stringify({ error: "query too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rmaId = body?.rmaId ? String(body.rmaId) : null;
    const classe = body?.classe ? String(body.classe) : null;
    const threshold = typeof body?.threshold === "number" ? body.threshold : 0.65;
    const limit = Math.min(Number(body?.limit ?? 8), 30);

    const vector = await embedQuery(query);
    if (!vector) {
      return new Response(
        JSON.stringify({ error: "Embedding API unavailable. Set GOOGLE_AI_API_KEY." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await sb.rpc("search_ocr_embeddings", {
      query_embedding: `[${vector.join(",")}]`,
      target_classe: classe,
      target_rma_id: rmaId,
      match_threshold: threshold,
      match_count: limit,
    });
    if (error) {
      console.error("rpc error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ hits: data ?? [], query }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("embed-search error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
