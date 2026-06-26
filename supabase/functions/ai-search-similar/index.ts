// AI Search Similar — busca semântica em ocr_embeddings via Vertex AI + PGVector
// POST /ai-search-similar { text, classe?, rma_id?, threshold?, limit? }
// Retorna top-K documentos OCR similares.

import { generateEmbedding } from "../_shared/vertex-embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface SearchBody {
  text: string;
  classe?: string;
  rma_id?: string;
  threshold?: number;
  limit?: number;
}

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não suportado" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const uid = await getUserId(req);
  if (!uid) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: SearchBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body?.text?.trim()) {
    return new Response(JSON.stringify({ error: "text é obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const emb = await generateEmbedding(body.text);
    if (!emb) {
      return new Response(JSON.stringify({ error: "Falha ao gerar embedding" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_ocr_embeddings`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: JSON.stringify(emb),
        target_classe: body.classe ?? null,
        target_rma_id: body.rma_id ?? null,
        match_threshold: body.threshold ?? 0.7,
        match_count: body.limit ?? 5,
      }),
    });

    if (!rpc.ok) {
      const t = await rpc.text();
      console.error("search_ocr_embeddings:", rpc.status, t);
      return new Response(JSON.stringify({ error: "Falha na busca", detail: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await rpc.json();
    return new Response(
      JSON.stringify({ embedding_dims: emb.length, count: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-search-similar error", e);
    const msg = e instanceof Error ? e.message : "Erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
