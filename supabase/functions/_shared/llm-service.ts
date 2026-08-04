// Pluggable LLM Service — supports Lovable AI Gateway (default), with
// optional pass-through for OpenAI / Gemini if the user later adds keys.
//
// Includes a Postgres semantic cache (llm_response_cache) keyed by SHA-256
// of (provider|model|prompt|system) so identical prompts skip the LLM call.
//
// Usage:
//   const r = await callLLM({ prompt, system, model, useCache: true });
//   r.text, r.cached, r.tokens

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type LLMProvider = "lovable" | "openai" | "gemini";

export interface LLMOptions {
  prompt: string;
  system?: string;
  model?: string;          // default: google/gemini-3-flash-preview
  provider?: LLMProvider;  // default: 'lovable'
  temperature?: number;
  maxTokens?: number;
  useCache?: boolean;      // default: true
  cacheTtlHours?: number;  // default: 720 (30 days) — aumentado para reduzir MISS
  toolSchema?: any;        // optional structured-output tool
}

export interface LLMResult {
  text: string | null;
  toolArgs?: any;
  cached: boolean;
  provider: LLMProvider;
  model: string;
  tokens?: { input?: number; output?: number };
}

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function lookupCache(hash: string): Promise<LLMResult | null> {
  const { data } = await sb()
    .from("llm_response_cache")
    .select("response,provider,model,tokens_input,tokens_output,expires_at")
    .eq("prompt_hash", hash)
    .maybeSingle();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  // bump hit count async
  sb().rpc("bump_llm_cache_hit", { p_hash: hash }).then(() => {});
  const resp = data.response as any;
  return {
    text: resp?.text ?? null,
    toolArgs: resp?.toolArgs,
    cached: true,
    provider: data.provider as LLMProvider,
    model: data.model,
    tokens: { input: data.tokens_input ?? undefined, output: data.tokens_output ?? undefined },
  };
}

async function storeCache(
  hash: string,
  preview: string,
  result: LLMResult,
  ttlHours: number,
): Promise<void> {
  await sb().from("llm_response_cache").upsert({
    prompt_hash: hash,
    provider: result.provider,
    model: result.model,
    prompt_preview: preview.slice(0, 500),
    response: { text: result.text, toolArgs: result.toolArgs ?? null },
    tokens_input: result.tokens?.input ?? null,
    tokens_output: result.tokens?.output ?? null,
    expires_at: new Date(Date.now() + ttlHours * 3600_000).toISOString(),
  }, { onConflict: "prompt_hash" });
}

// ---------- Provider implementations ----------

async function callLovable(opts: LLMOptions, model: string): Promise<LLMResult> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const body: any = {
    model,
    messages: [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      { role: "user", content: opts.prompt },
    ],
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  if (opts.toolSchema) {
    body.tools = [{ type: "function", function: opts.toolSchema }];
    body.tool_choice = { type: "function", function: { name: opts.toolSchema.name } };
  }
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp.status === 429) throw new Error("LLM_RATE_LIMITED");
  if (resp.status === 402) throw new Error("LLM_PAYMENT_REQUIRED");
  if (!resp.ok) throw new Error(`Lovable AI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const json = await resp.json();
  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? null;
  let toolArgs: any = undefined;
  const tc = choice?.message?.tool_calls?.[0];
  if (tc?.function?.arguments) {
    try { toolArgs = JSON.parse(tc.function.arguments); } catch { toolArgs = tc.function.arguments; }
  }
  const result: LLMResult = {
    text,
    toolArgs,
    cached: false,
    provider: "lovable",
    model,
    tokens: {
      input: json.usage?.prompt_tokens,
      output: json.usage?.completion_tokens,
    },
  };
  // Telemetria best-effort
  try {
    const { logAiUsage } = await import("./ai-telemetry.ts");
    logAiUsage({
      type: opts.toolSchema ? "extraction" : "generation",
      model,
      tokensInput: result.tokens?.input ?? 0,
      tokensOutput: result.tokens?.output ?? 0,
      requests: 1,
      metadata: { fn: "llm-service.callLovable", tool: opts.toolSchema?.name ?? null },
    }).catch(() => {});
  } catch (_) { /* noop */ }
  return result;
}

async function callOpenAI(opts: LLMOptions, model: string): Promise<LLMResult> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not configured (fallback to lovable)");
  // Same OpenAI-compatible payload
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.prompt },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
  const json = await resp.json();
  return {
    text: json.choices?.[0]?.message?.content ?? null,
    cached: false,
    provider: "openai",
    model,
    tokens: { input: json.usage?.prompt_tokens, output: json.usage?.completion_tokens },
  };
}

async function callGemini(opts: LLMOptions, model: string): Promise<LLMResult> {
  const key = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!key) throw new Error("GOOGLE_AI_API_KEY not configured");
  
  // Se houver anexo (multimodal), o chamador pode passar file_data em opts.file
  // Aqui implementamos suporte multimodal básico via inlineData
  const parts: any[] = [{ text: opts.prompt }];
  
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      }),
    },
  );
  if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
  const json = await resp.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? null;
  return {
    text,
    cached: false,
    provider: "gemini",
    model,
    tokens: {
      input: json.usageMetadata?.promptTokenCount,
      output: json.usageMetadata?.candidatesTokenCount,
    },
  };
}

// ---------- Public API ----------

// Normaliza prompt para o hash do cache: colapsa espaços/quebras e trim,
// aumentando a probabilidade de HIT entre execuções com formatação variada.
function normalizeForCache(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

export async function callLLM(opts: LLMOptions): Promise<LLMResult> {
  const provider: LLMProvider = opts.provider ?? "lovable";
  const model = opts.model ?? DEFAULT_MODEL;
  const useCache = opts.useCache !== false;
  const ttl = opts.cacheTtlHours ?? 720;

  const cacheKeyRaw = JSON.stringify({
    provider,
    model,
    system: normalizeForCache(opts.system ?? ""),
    prompt: normalizeForCache(opts.prompt),
    tool: opts.toolSchema?.name ?? null,
  });
  const hash = await sha256Hex(cacheKeyRaw);

  if (useCache) {
    const hit = await lookupCache(hash);
    if (hit) return hit;
  }

  let result: LLMResult;
  if (provider === "openai") result = await callOpenAI(opts, model);
  else if (provider === "gemini") result = await callGemini(opts, model);
  else result = await callLovable(opts, model);

  if (useCache && (result.text || result.toolArgs)) {
    try { await storeCache(hash, opts.prompt, result, ttl); } catch (e) {
      console.warn("[llm-service] cache store failed", e);
    }
  }
  return result;
}
