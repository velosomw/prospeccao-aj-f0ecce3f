// process-queue — Phase 1 worker
// Picks pending items from processing_queue and triggers ai-full-process
// for the matching pipeline_documents row. Marks tracker rows as
// processed/error and updates queue status accordingly.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { audit, getServiceClient } from "../_shared/onedrive.ts";
import { markError, markProcessed } from "../_shared/delta-engine.ts";
import { hasCompletedOcr, runOcrCascade } from "../_shared/ocr-cascade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function triggerFullProcess(documentId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${url}/functions/v1/ai-full-process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key!,
    },
    body: JSON.stringify({ document_id: documentId }),
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

type QueueItem = {
  id: string;
  file_id: string;
  rma_id: string | null;
  company_id: string | null;
  attempts: number | null;
  max_attempts: number | null;
  priority: number | null;
  payload: any;
};

async function processOne(it: QueueItem) {
  const sb = getServiceClient();

  // Claim row atomicamente
  const { data: claimed } = await sb
    .from("processing_queue")
    .update({
      status: "processing",
      picked_at: new Date().toISOString(),
      attempts: (it.attempts ?? 0) + 1,
    })
    .eq("id", it.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return { file_id: it.file_id, ok: false, error: "claim_lost", skipped: true };

  // Mark tracker as processing
  await sb.from("onedrive_files").update({ status: "processing" }).eq("file_id", it.file_id);

  // Resolve pipeline_documents priorizando match exato por (external_id, rma_id).
  // Como onedrive_files.rma_id pode usar slug ("RMA-DIP-01-2026") e pipeline_documents
  // pode ter linhas para o mesmo external_id em RMAs diferentes (arquivo reutilizado
  // entre períodos), o match estrito evita persistir resultado no RMA errado.
  // Fallback: linha mais recente por external_id (somente se nada bater por rma).
  let doc: { id: string; mime_type: string | null; file_name: string | null; rma_id: string | null } | null = null;
  if (it.rma_id) {
    const { data: exact } = await sb
      .from("pipeline_documents")
      .select("id, mime_type, file_name, rma_id")
      .eq("external_id", it.file_id)
      .eq("rma_id", it.rma_id)
      .order("created_at", { ascending: false })
      .limit(1);
    doc = exact?.[0] ?? null;
  }
  if (!doc) {
    const { data: any } = await sb
      .from("pipeline_documents")
      .select("id, mime_type, file_name, rma_id, created_at")
      .eq("external_id", it.file_id)
      .order("created_at", { ascending: false })
      .limit(1);
    doc = any?.[0] ?? null;
  }


  if (!doc?.id) {
    await sb.from("processing_queue").update({
      status: "error",
      finished_at: new Date().toISOString(),
      error_message: "pipeline_documents row not found",
    }).eq("id", it.id);
    await markError(it.file_id, "pipeline_documents row not found");
    // Sem retry: arquiva direto na DLQ
    await sb.rpc("archive_failed_job", { p_queue_id: it.id });
    return { file_id: it.file_id, ok: false, error: "no document row", dlq: true };
  }

  try {
    // Honor orchestrator route hint (when present in payload)
    const route: string[] = Array.isArray(it.payload?.route) ? it.payload.route : [];
    const wantsOcr = route.length === 0 || route.includes("OCR");
    const wantsLlm = route.length === 0 || route.includes("LLM");

    // 1) OCR garantido (a menos que a rota exclua)
    const ocrPresent = await hasCompletedOcr(doc.id);
    let ocrInfo: any = { skipped: true };
    if (wantsOcr && !ocrPresent) {
      const { data: tracker } = await sb
        .from("onedrive_files")
        .select("drive_id, mime_type, file_name, path")
        .eq("file_id", it.file_id)
        .maybeSingle();
      if (!tracker?.drive_id) throw new Error("drive_id ausente em onedrive_files");
      const hint = (tracker.path || (doc as any).topic_id || "").toString().toLowerCase();
      const cascade = await runOcrCascade({
        driveId: tracker.drive_id,
        itemId: it.file_id,
        fileName: tracker.file_name || doc.file_name || it.file_id,
        mimeType: tracker.mime_type || doc.mime_type || "application/octet-stream",
        documentId: doc.id,
        rmaId: it.rma_id ?? undefined,
        hint,
      });
      ocrInfo = { engine: cascade.engine, ok: cascade.ok, attempts: cascade.attempts, fromCache: cascade.fromCache };
      if (!cascade.ok) throw new Error(`OCR cascade falhou: ${JSON.stringify(cascade.attempts)}`);
    }

    // 2) ai-full-process (LLM + Validação)
    let llmInfo: any = { skipped: true };
    if (wantsLlm) {
      const r = await triggerFullProcess(doc.id);
      if (!r.ok) throw new Error(`ai-full-process ${r.status}: ${r.body.slice(0, 200)}`);
      llmInfo = { ok: true, status: r.status };
    }

    // 3) Consolidação determinística (indicadores + payload de relatório)
    let consolidationInfo: any = { skipped: true };
    const wantsConsolidation = route.length === 0 || route.includes("CONSOLIDATION");
    if (wantsConsolidation) {
      try {
        const url = Deno.env.get("SUPABASE_URL");
        const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const cr = await fetch(`${url}/functions/v1/consolidate-worker`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            apikey: key!,
          },
          body: JSON.stringify({ document_id: doc.id, persist: true }),
        });
        const cBody = await cr.json().catch(() => ({}));
        consolidationInfo = {
          ok: cr.ok,
          status: cr.status,
          score_rj: cBody?.result?.score_rj?.score ?? null,
          kanitz: cBody?.result?.kanitz?.fatorInsolvencia ?? null,
          alertas: cBody?.result?.alertas?.length ?? 0,
        };
        if (!cr.ok) console.warn("consolidate-worker non-2xx", cr.status, cBody);
      } catch (cErr) {
        consolidationInfo = { ok: false, error: (cErr as Error).message };
        console.warn("consolidate-worker failed (non-fatal)", cErr);
      }
    }

    await sb.from("processing_queue").update({
      status: "done",
      finished_at: new Date().toISOString(),
    }).eq("id", it.id);
    await markProcessed(it.file_id);
    return { file_id: it.file_id, document_id: doc.id, ok: true, ocr: ocrInfo, llm: llmInfo, consolidation: consolidationInfo, route };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const newAttempts = (it.attempts ?? 0) + 1;
    const shouldRetry = newAttempts < (it.max_attempts ?? 3);
    await sb.from("processing_queue").update({
      status: shouldRetry ? "pending" : "error",
      finished_at: shouldRetry ? null : new Date().toISOString(),
      error_message: msg,
    }).eq("id", it.id);
    if (!shouldRetry) {
      await markError(it.file_id, msg);
      // 🔥 Dead Letter Queue — arquiva job esgotado para diagnóstico/reprocesso manual
      try {
        await sb.rpc("archive_failed_job", { p_queue_id: it.id });
      } catch (dlqErr) {
        console.error("DLQ archive failed", dlqErr);
      }
    }
    return { file_id: it.file_id, ok: false, error: msg, will_retry: shouldRetry, dlq: !shouldRetry };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { batch_size = 5, concurrency = 3, force_manual = false } = body;
    const conc = Math.min(Math.max(Number(concurrency) || 3, 1), 10);

    const sb = getServiceClient();

    // Respect worker_config.mode unless force_manual is true.
    // paused      -> ignora tudo
    // on_demand   -> só processa jobs com trigger_source='manual'
    // daily       -> processa qualquer job (cron/manual)
    const { data: cfg } = await sb
      .from("worker_config")
      .select("mode, enabled")
      .eq("id", "default")
      .maybeSingle();
    const mode = (cfg?.mode as string) || "paused";

    if (!force_manual) {
      if (mode === "paused" || cfg?.enabled === false) {
        return new Response(JSON.stringify({ success: true, processed: 0, message: "worker paused", mode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let q = sb
      .from("processing_queue")
      .select("id,file_id,rma_id,company_id,attempts,max_attempts,priority,payload,trigger_source")
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(batch_size);

    // Em on_demand sem force_manual, só pega jobs manuais
    if (!force_manual && mode === "on_demand") {
      q = q.eq("trigger_source", "manual");
    }

    const { data: items, error } = await q;

    if (error) throw error;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, message: "queue empty", mode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Marca última execução
    await sb.from("worker_config").update({ last_run_at: new Date().toISOString() }).eq("id", "default");


    // Paralelismo controlado: workers consomem da mesma fila in-memory
    const queue: QueueItem[] = [...(items as QueueItem[])];
    const results: any[] = [];
    async function worker() {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        try {
          results.push(await processOne(item));
        } catch (e) {
          results.push({ file_id: item.file_id, ok: false, error: (e as Error).message, fatal: true });
        }
      }
    }
    await Promise.all(Array.from({ length: conc }, () => worker()));

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      retry: results.filter((r) => r.will_retry).length,
      dlq: results.filter((r) => r.dlq).length,
      errors: results.filter((r) => !r.ok && !r.will_retry).length,
      concurrency: conc,
    };

    await audit({
      documentId: null,
      step: "process_queue",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: { summary, results },
    });

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      summary,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("process-queue error", e);
    await audit({
      documentId: null,
      step: "process_queue",
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
