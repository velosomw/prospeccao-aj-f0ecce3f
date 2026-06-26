// Edge function: dynamic-prompt-build
// POST { companyId, documentType, extractedText, ocrConfidence?, layoutDetected?, source?, run? }
//   - run=false (default): returns the assembled prompt + meta (preview)
//   - run=true: also calls LLM with the built prompt and returns the parsed JSON
//
// Reads-only against company tables; does not persist anything.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { buildDynamicPrompt } from "../_shared/dynamic-prompt-builder.ts";
import { callLLM } from "../_shared/llm-service.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const companyId = String(body?.companyId ?? "").trim();
    const documentType = String(body?.documentType ?? "balancete").trim();
    const extractedText = String(body?.extractedText ?? "").trim();
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const built = await buildDynamicPrompt({
      companyId,
      rmaId: body?.rmaId,
      documentType,
      extractedText,
      ocrConfidence: typeof body?.ocrConfidence === "number" ? body.ocrConfidence : undefined,
      layoutDetected: body?.layoutDetected,
      source: body?.source,
      maxAccounts: body?.maxAccounts,
      maxPatterns: body?.maxPatterns,
      maxFacts: body?.maxFacts,
      maxTextChars: body?.maxTextChars,
    });

    if (body?.run !== true) {
      return new Response(JSON.stringify({ ok: true, ...built }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!extractedText) {
      return new Response(JSON.stringify({ error: "extractedText required when run=true" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const r = await callLLM({
      system: built.system,
      prompt: built.prompt,
      model: built.meta.recommendedModel,
      temperature: 0.1,
      useCache: body?.useCache !== false,
    });

    let parsed: any = null;
    if (r.text) {
      const cleaned = r.text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      try { parsed = JSON.parse(cleaned); } catch { parsed = null; }
    }

    return new Response(JSON.stringify({
      ok: true,
      meta: built.meta,
      llm: { provider: r.provider, model: r.model, cached: r.cached, tokens: r.tokens },
      parsed,
      raw: parsed ? null : r.text,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("dynamic-prompt-build error:", e);
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
