// Edge function: rag-context
// Operações:
//   POST { action: "retrieve", companyId, text, topK?, threshold?, tipos? }
//     → { hits, topK, threshold, promptBlock }
//   POST { action: "index", companyId, tipo, conteudo, rmaId?, weight?, source?, documentId? }
//     → { ok, id, cached }
//   POST { action: "index_batch", companyId, items: [{tipo, conteudo, ...}] }
//     → { ok, results: [...] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { ragRetrieve, indexContext, ragContextsToPromptBlock } from "../_shared/rag-retriever.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "retrieve");
    const companyId = String(body?.companyId ?? "").trim();
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "retrieve") {
      const text = String(body?.text ?? "").trim();
      if (!text) {
        return new Response(JSON.stringify({ error: "text required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const out = await ragRetrieve({
        companyId,
        text,
        topK: body?.topK,
        threshold: body?.threshold,
        tipos: body?.tipos,
      });
      return new Response(JSON.stringify({
        ok: true,
        ...out,
        promptBlock: ragContextsToPromptBlock(out.hits),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "index") {
      const r = await indexContext({
        companyId,
        rmaId: body?.rmaId,
        tipo: body?.tipo,
        conteudo: String(body?.conteudo ?? ""),
        weight: body?.weight,
        source: body?.source,
        documentId: body?.documentId,
        extractionId: body?.extractionId,
      });
      return new Response(JSON.stringify(r), {
        status: r.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "index_batch") {
      const items = Array.isArray(body?.items) ? body.items : [];
      const results: any[] = [];
      for (const it of items) {
        const r = await indexContext({
          companyId,
          rmaId: it?.rmaId ?? body?.rmaId,
          tipo: it?.tipo,
          conteudo: String(it?.conteudo ?? ""),
          weight: it?.weight,
          source: it?.source,
          documentId: it?.documentId,
          extractionId: it?.extractionId,
        });
        results.push(r);
      }
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rag-context error:", e);
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
