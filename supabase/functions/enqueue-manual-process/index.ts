// enqueue-manual-process — dispara reprocessamento manual de arquivos
// com erro/pendência. Insere/atualiza linhas em processing_queue como
// trigger_source='manual' e chama process-queue com force_manual=true
// para executar imediatamente, sem esperar o tick do worker.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function svc() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const fileIds: string[] = Array.isArray(body.file_ids) ? body.file_ids : [];
    if (fileIds.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "file_ids vazio" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (fileIds.length > 500) {
      return new Response(JSON.stringify({ success: false, error: "máx. 500 file_ids por chamada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = svc();

    const { data: files, error: fErr } = await sb
      .from("onedrive_files")
      .select("file_id, company_id, rma_id, ano, mes, status")
      .in("file_id", fileIds);
    if (fErr) throw fErr;

    const eligible = (files ?? []).filter(f =>
      ["error", "manual_upload_required", "pending", "tracked", "new", "updated", "queued"].includes(f.status ?? "")
    );

    if (eligible.length === 0) {
      return new Response(JSON.stringify({ success: true, enqueued: 0, message: "nenhum arquivo elegível" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cancela jobs antigos pending para esses file_ids para evitar duplicação
    await sb
      .from("processing_queue")
      .update({ status: "cancelled", block_reason: "superseded_by_manual", updated_at: new Date().toISOString() })
      .in("file_id", eligible.map(f => f.file_id))
      .in("status", ["pending", "failed"]);

    // Reseta status dos arquivos
    await sb
      .from("onedrive_files")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .in("file_id", eligible.map(f => f.file_id));

    // Insere jobs manuais com prioridade alta
    const rows = eligible.map(f => ({
      file_id: f.file_id,
      company_id: f.company_id,
      rma_id: f.rma_id,
      ano: f.ano,
      mes: f.mes,
      status: "pending",
      priority: 10,
      attempts: 0,
      reason: "manual_reprocess",
      trigger_source: "manual",
      payload: { triggered_by: "enqueue-manual-process" },
    }));
    const { error: iErr } = await sb.from("processing_queue").insert(rows);
    if (iErr) throw iErr;

    // Dispara process-queue imediatamente com force_manual
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const trig = await fetch(`${url}/functions/v1/process-queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ batch_size: Math.min(rows.length, 25), concurrency: 3, force_manual: true }),
    });
    const trigBody = await trig.text();

    return new Response(JSON.stringify({
      success: true,
      enqueued: rows.length,
      skipped: fileIds.length - rows.length,
      worker_trigger: { ok: trig.ok, status: trig.status, body: trigBody.slice(0, 500) },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("enqueue-manual-process error", e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
