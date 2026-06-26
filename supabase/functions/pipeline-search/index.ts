import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  query: string;
  rma_id: string;
  match_threshold?: number;
  match_count?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth: validate JWT via user-scoped client
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as SearchRequest;

    // Validation
    if (!body?.query || typeof body.query !== "string" || body.query.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: "query inválida (mínimo 2 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!body?.rma_id || typeof body.rma_id !== "string") {
      return new Response(
        JSON.stringify({ error: "rma_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const query = body.query.trim().slice(0, 2000);
    const rma_id = body.rma_id;
    const match_threshold = typeof body.match_threshold === "number"
      ? Math.min(Math.max(body.match_threshold, 0), 1)
      : 0.7;
    const match_count = typeof body.match_count === "number"
      ? Math.min(Math.max(Math.floor(body.match_count), 1), 50)
      : 10;

    // Generate embedding via Lovable AI Gateway (Gemini text-embedding 768d)
    const t0 = Date.now();
    const embedRes = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/text-embedding-004",
        input: query,
      }),
    });

    if (embedRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (embedRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "Créditos de IA insuficientes. Adicione créditos no Lovable AI." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!embedRes.ok) {
      const errText = await embedRes.text();
      console.error("Embedding API error:", embedRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Falha ao gerar embedding da consulta" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const embedJson = await embedRes.json();
    try {
      const { logEmbeddingUsage } = await import("../_shared/ai-telemetry.ts");
      logEmbeddingUsage(embedJson, { model: "google/text-embedding-004", inputCount: 1, metadata: { fn: "pipeline-search" } }).catch(() => {});
    } catch (_) { /* noop */ }
    const embedding: number[] | undefined =
      embedJson?.data?.[0]?.embedding ?? embedJson?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      console.error("Embedding response missing vector:", embedJson);
      return new Response(
        JSON.stringify({ error: "Resposta de embedding inválida" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const embedMs = Date.now() - t0;

    // Semantic search via SQL function (pgvector cosine similarity)
    const t1 = Date.now();
    const { data: matches, error: searchErr } = await supabase.rpc("search_documents", {
      query_embedding: embedding as unknown as string,
      target_rma_id: rma_id,
      match_threshold,
      match_count,
    });

    if (searchErr) {
      console.error("search_documents error:", searchErr);
      return new Response(
        JSON.stringify({ error: "Falha na busca semântica", details: searchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const searchMs = Date.now() - t1;

    // Enrich with document metadata
    const docIds = Array.from(new Set((matches ?? []).map((m: any) => m.document_id)));
    let docsById: Record<string, any> = {};
    if (docIds.length > 0) {
      const { data: docs } = await supabase
        .from("pipeline_documents")
        .select("id, file_name, document_type, rma_topic, summary, page_count")
        .in("id", docIds);
      docsById = Object.fromEntries((docs ?? []).map((d) => [d.id, d]));
    }

    const results = (matches ?? []).map((m: any) => ({
      document_id: m.document_id,
      chunk_text: m.chunk_text,
      similarity: m.similarity,
      document: docsById[m.document_id] ?? null,
    }));

    return new Response(
      JSON.stringify({
        query,
        rma_id,
        match_threshold,
        match_count,
        total: results.length,
        timings: { embedding_ms: embedMs, search_ms: searchMs },
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("pipeline-search error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
