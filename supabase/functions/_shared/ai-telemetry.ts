// Telemetria centralizada de uso de IA → ai_usage_logs.
// Trigger trg_calculate_cost preenche cost_calculated via calculate_ai_cost.
// Best-effort: nunca quebra o fluxo principal.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type AiServiceKey =
  | "gemini_2_5_pro"
  | "gemini_2_5_flash"
  | "gemini_2_5_flash_lite"
  | "gemini_3_flash"
  | "gemini_3_pro"
  | "embedding"
  | "google_vision"
  | "document_ai"
  | "openai_gpt5"
  | "openai_gpt5_mini"
  | "openai_gpt5_nano";

export function modelToService(model: string): AiServiceKey {
  const m = (model || "").toLowerCase();
  if (m.includes("embedding") || m.includes("text-embedding")) return "embedding";
  if (m.includes("gemini-2.5-pro")) return "gemini_2_5_pro";
  if (m.includes("gemini-2.5-flash-lite")) return "gemini_2_5_flash_lite";
  if (m.includes("gemini-2.5-flash")) return "gemini_2_5_flash";
  if (m.includes("gemini-3") && m.includes("pro")) return "gemini_3_pro";
  if (m.includes("gemini-3") && m.includes("flash")) return "gemini_3_flash";
  if (m.includes("vision")) return "google_vision";
  if (m.includes("documentai") || m.includes("document_ai")) return "document_ai";
  if (m.includes("gpt-5-nano")) return "openai_gpt5_nano";
  if (m.includes("gpt-5-mini")) return "openai_gpt5_mini";
  if (m.includes("gpt-5")) return "openai_gpt5";
  return "gemini_2_5_flash";
}

function providerFromService(svc: string): string {
  if (svc.startsWith("openai")) return "openai";
  return "google";
}

export interface UsageInput {
  service?: AiServiceKey | string;
  type: "ocr" | "extraction" | "classification" | "embedding" | "validation" | "generation" | "chat" | "other";
  documentId?: string | null;
  tokensInput?: number;
  tokensOutput?: number;
  requests?: number;
  pages?: number;
  model?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export async function logAiUsage(input: UsageInput): Promise<void> {
  try {
    const service = input.service ?? modelToService(input.model || "");
    const provider = input.provider ?? providerFromService(service);
    await fetch(`${SUPABASE_URL}/rest/v1/ai_usage_logs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        service,
        provider,
        type: input.type,
        document_id: input.documentId ?? null,
        tokens_input: Math.max(0, Math.round(input.tokensInput ?? 0)),
        tokens_output: Math.max(0, Math.round(input.tokensOutput ?? 0)),
        requests: input.requests ?? 1,
        pages: input.pages ?? 0,
        metadata: { ...(input.metadata ?? {}), model: input.model ?? null },
      }),
    });
  } catch (e) {
    console.error("[ai-telemetry] logAiUsage failed:", e);
  }
}

// Estima tokens quando o gateway não retorna usage (4 chars ≈ 1 token)
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Loga uso a partir da resposta do Lovable AI Gateway / OpenAI-compatible.
 * Usa json.usage.{prompt_tokens,completion_tokens} quando disponível.
 */
export async function logGatewayUsage(
  json: any,
  opts: { model: string; type: UsageInput["type"]; documentId?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  const u = json?.usage ?? {};
  const ti = +(u.prompt_tokens ?? u.input_tokens ?? 0) || 0;
  const to = +(u.completion_tokens ?? u.output_tokens ?? 0) || 0;
  await logAiUsage({
    type: opts.type,
    model: opts.model,
    documentId: opts.documentId,
    tokensInput: ti,
    tokensOutput: to,
    requests: 1,
    metadata: opts.metadata,
  });
}

/** Loga uso de embedding a partir da resposta /v1/embeddings */
export async function logEmbeddingUsage(
  json: any,
  opts: { model: string; inputCount: number; documentId?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  const u = json?.usage ?? {};
  const ti = +(u.prompt_tokens ?? u.total_tokens ?? 0) || 0;
  await logAiUsage({
    type: "embedding",
    model: opts.model,
    service: "embedding",
    documentId: opts.documentId,
    tokensInput: ti,
    tokensOutput: 0,
    requests: opts.inputCount || 1,
    metadata: opts.metadata,
  });
}
