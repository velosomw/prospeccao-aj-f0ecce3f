// Telemetria de performance por etapa do pipeline → public.processing_telemetry
// Best-effort: nunca interrompe o fluxo principal.
import { createClient } from "npm:@supabase/supabase-js@2";

export type Stage =
  | "acquisition"
  | "download"
  | "hash"
  | "ocr"
  | "extraction"
  | "validation"
  | "persistence"
  | "knowledge"
  | "total";

export interface TelemetryInput {
  run_id?: string | null;
  linha_id?: string | null;
  document_id?: string | null;
  stage: Stage;
  status?: "success" | "error";
  duration_ms?: number;
  bytes?: number;
  pages?: number;
  tokens_input?: number;
  tokens_output?: number;
  model?: string | null;
  provider?: string | null;
  cost_usd?: number | null;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function logStage(input: TelemetryInput): Promise<void> {
  try {
    await admin().from("processing_telemetry").insert({
      run_id: input.run_id ?? null,
      linha_id: input.linha_id ?? null,
      document_id: input.document_id ?? null,
      stage: input.stage,
      status: input.status ?? "success",
      duration_ms: input.duration_ms ?? null,
      bytes: input.bytes ?? null,
      pages: input.pages ?? null,
      tokens_input: input.tokens_input ?? null,
      tokens_output: input.tokens_output ?? null,
      model: input.model ?? null,
      provider: input.provider ?? null,
      cost_usd: input.cost_usd ?? null,
      error_message: input.error_message ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    console.error("[processing-telemetry] insert failed:", e);
  }
}

/** Mede uma etapa e registra a telemetria automaticamente. */
export async function measure<T>(
  ctx: Omit<TelemetryInput, "stage" | "duration_ms" | "status">,
  stage: Stage,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    logStage({ ...ctx, stage, status: "success", duration_ms: Date.now() - t0 });
    return out;
  } catch (e) {
    logStage({
      ...ctx,
      stage,
      status: "error",
      duration_ms: Date.now() - t0,
      error_message: String((e as Error)?.message ?? e),
    });
    throw e;
  }
}
