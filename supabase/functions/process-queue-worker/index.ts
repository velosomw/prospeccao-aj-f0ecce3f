// Worker assíncrono que consome processing_queue
// Invocado a cada 30s via pg_cron, sem auth (verify_jwt = false)
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface QueueJob {
  id: string;
  file_id: string;
  company_id: string;
  rma_id: string | null;
  ano: number | null;
  mes: number | null;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

/** Detecta header Retry-After (em ms) numa resposta de erro do provider */
function extractRetryAfterMs(errorMessage: string): number | null {
  const m = errorMessage.match(/Retry after (\d+)\s*ms/i);
  if (m) return parseInt(m[1], 10);
  const s = errorMessage.match(/Retry-After:\s*(\d+)/i);
  if (s) return parseInt(s[1], 10) * 1000;
  return null;
}

function isRateLimit(errorMessage: string): boolean {
  return /rate.?limit|429|too many requests/i.test(errorMessage);
}

/** Verifica bucket de rate-limit antes de gastar quota com o provider */
async function preflightRateLimit(provider: string, model: string): Promise<{ allowed: boolean; retryAfterMs: number; reason: string }> {
  const { data, error } = await supabase.rpc("check_rate_limit", { p_provider: provider, p_model: model });
  if (error) {
    console.warn("[worker] check_rate_limit erro, liberando por segurança:", error.message);
    return { allowed: true, retryAfterMs: 0, reason: "rpc_error" };
  }
  const r = data as { allowed: boolean; retry_after_ms: number; reason: string };
  return { allowed: r.allowed, retryAfterMs: r.retry_after_ms, reason: r.reason };
}

/** Roteador: arquivos grandes vão para a fila batch (Document AI) em vez de processar agora */
async function maybeDefer(job: QueueJob): Promise<boolean> {
  try {
    // Tenta extrair tamanho/páginas do payload OU consulta onedrive_files
    let sizeBytes: number | null = (job.payload?.file_size_bytes as number) ?? null;
    let pages: number | null = (job.payload?.page_count as number) ?? null;
    let fileName = (job.payload?.file_name as string) ?? "";
    let mimeType = (job.payload?.mime_type as string) ?? "";
    let folderPath = (job.payload?.folder_path as string) ?? (job.payload?.path as string) ?? "";

    if (sizeBytes == null || !fileName) {
      const { data: f } = await supabase
        .from("onedrive_files")
        .select("name, mime_type, size_bytes, path")
        .eq("file_id", job.file_id)
        .maybeSingle();
      if (f) {
        sizeBytes = sizeBytes ?? (f.size_bytes ?? null);
        fileName = fileName || f.name || "";
        mimeType = mimeType || f.mime_type || "";
        folderPath = folderPath || (f.path?.split("/").slice(0, -1).join("/") ?? "");
      }
    }

    // Sem dado de tamanho → segue síncrono
    if (sizeBytes == null && pages == null) return false;

    const { data: shouldDefer } = await supabase.rpc("should_defer_file", {
      p_size_bytes: sizeBytes,
      p_pages: pages,
    });
    if (!shouldDefer) return false;

    // Enfileira deferred (idempotente)
    const { data: jobId, error: enqErr } = await supabase.rpc("enqueue_deferred_job", {
      p_file_id: job.file_id,
      p_company_id: job.company_id ?? null,
      p_rma_id: job.rma_id ?? null,
      p_folder_path: folderPath ?? null,
      p_file_name: fileName || job.file_id,
      p_mime_type: mimeType ?? null,
      p_size_bytes: sizeBytes,
      p_pages: pages,
      p_document_id: (job.payload?.document_id as string) ?? null,
      p_payload: job.payload ?? {},
    });
    if (enqErr) throw enqErr;

    // Marca processing_queue como deferred + completa (libera slot)
    await supabase
      .from("processing_queue")
      .update({ processing_mode: "deferred" })
      .eq("id", job.id);
    await supabase.rpc("complete_processing_job", {
      p_job_id: job.id,
      p_payload: { deferred_job_id: jobId, mode: "deferred" },
    });
    console.log(`[worker] job ${job.id} → deferred (file ${sizeBytes} bytes, ${pages ?? "?"} pages) → batch ${jobId}`);
    return true;
  } catch (e) {
    console.warn(`[worker] maybeDefer falhou para job ${job.id}:`, e);
    return false;
  }
}

/** Processa um job: invoca ai-full-process e marca done/fail */
async function processJob(job: QueueJob): Promise<void> {
  console.log(`[worker] job ${job.id} file=${job.file_id} attempt=${job.attempts}/${job.max_attempts}`);

  // Roteador: deve ir para batch (24h, mais barato)?
  if (await maybeDefer(job)) return;

  // Provider/model padrão (pode vir do payload por agente)
  const provider = (job.payload?.provider as string) ?? "lovable_ai";
  const model = (job.payload?.model as string) ?? "google/gemini-2.5-flash-lite";

  // Pré-flight: bucket bloqueado? agenda para depois sem queimar tentativa
  const pre = await preflightRateLimit(provider, model);
  if (!pre.allowed) {
    console.log(`[worker] job ${job.id} bucket bloqueado (${pre.reason}), retry_after=${pre.retryAfterMs}ms`);
    await supabase.rpc("fail_processing_job", {
      p_job_id: job.id,
      p_error_message: `Rate limit bucket: ${pre.reason}`,
      p_retry_after_ms: pre.retryAfterMs,
      p_block_reason: "rate_limit",
    });
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke("ai-full-process", {
      body: {
        file_id: job.file_id,
        company_id: job.company_id,
        rma_id: job.rma_id,
        ano: job.ano,
        mes: job.mes,
        ...job.payload,
      },
    });

    if (error) throw new Error(error.message || JSON.stringify(error));
    if (data?.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));

    // Sucesso: consome quota do bucket
    await supabase.rpc("consume_rate_limit", { p_provider: provider, p_model: model, p_tokens: 0 });

    await supabase.rpc("complete_processing_job", {
      p_job_id: job.id,
      p_payload: data ?? null,
    });
    console.log(`[worker] job ${job.id} → done`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryAfter = extractRetryAfterMs(msg);
    const reason = isRateLimit(msg) ? "rate_limit" : "error";

    // Se foi rate-limit do provider, bloqueia o bucket inteiro
    if (reason === "rate_limit") {
      const blockMs = retryAfter ?? 60000;
      await supabase.rpc("block_rate_limit", {
        p_provider: provider,
        p_model: model,
        p_retry_after_ms: blockMs,
        p_reason: "provider_429",
      });
    }

    await supabase.rpc("fail_processing_job", {
      p_job_id: job.id,
      p_error_message: msg.substring(0, 1000),
      p_retry_after_ms: retryAfter,
      p_block_reason: reason,
    });
    console.log(`[worker] job ${job.id} → fail (${reason}, retry_after=${retryAfter}ms)`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;

  // Lê config global
  const { data: cfg } = await supabase
    .from("worker_config")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (cfg && cfg.enabled === false) {
    return new Response(JSON.stringify({ skipped: "worker disabled", workerId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Circuit breaker de custo IA — pausa worker se limite hora/dia atingido
  const { data: cb } = await supabase.rpc("ai_cost_should_pause");
  if (cb?.paused) {
    console.warn(`[worker] PAUSED by cost circuit breaker:`, cb);
    return new Response(JSON.stringify({ skipped: "ai_cost_circuit_breaker", workerId, breaker: cb }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const batchSize = cfg?.batch_size ?? 5;
  const lockMin = cfg?.lock_ttl_minutes ?? 5;

  // Claim atômico
  const { data: jobs, error: claimErr } = await supabase.rpc("claim_processing_jobs", {
    p_worker_id: workerId,
    p_batch_size: batchSize,
    p_lock_minutes: lockMin,
  });

  if (claimErr) {
    console.error("[worker] claim error:", claimErr);
    return new Response(JSON.stringify({ error: claimErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const list = (jobs ?? []) as QueueJob[];
  console.log(`[worker] ${workerId} claimed ${list.length} jobs`);

  // Processa em paralelo (cada um já é stateless)
  await Promise.all(list.map((j) => processJob(j).catch((e) => console.error(`[worker] unhandled ${j.id}`, e))));

  return new Response(
    JSON.stringify({
      workerId,
      claimed: list.length,
      duration_ms: Date.now() - startedAt,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
