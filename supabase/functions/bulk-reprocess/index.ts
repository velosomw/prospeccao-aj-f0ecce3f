// Edge Function: bulk-reprocess
// Reenfileira em lote todos os onedrive_files de um RMA/empresa que estão em
// status failed/error/new/updated/pending. Pode ser disparada via console
// (supabase--curl_edge_functions) ou pelo botão "Reprocessar todos filtrados".
//
// Body JSON:
//   { rma_id?: string, company_id?: string, ano?: number, mes?: number,
//     statuses?: string[], limit?: number, dry_run?: boolean }
//
// Resposta: { total, queued, failed, skipped, items: [...] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const DEFAULT_STATUSES = ["failed", "error", "new", "updated", "pending"];

function triggerWorker(url: string, key: string) {
  fetch(`${url}/functions/v1/process-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
    body: JSON.stringify({ concurrency: 5, maxJobs: 50 }),
  }).catch((e) => console.error("triggerWorker failed", e));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "missing_token" });

    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user) return json(401, { error: "invalid_token" });
    const userId = u.user.id;

    const sb = createClient(supaUrl, serviceKey);

    // Apenas gestor/coordenador/magistrado podem disparar em lote
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
    const set = new Set((roles || []).map((r: any) => r.role));
    const isPriv = set.has("gestor_ia") || set.has("coordenador") || set.has("magistrado");
    if (!isPriv && !set.has("consultor")) return json(403, { error: "forbidden" });

    const body = await req.json().catch(() => ({}));
    const rmaId = body?.rma_id ? String(body.rma_id) : null;
    const companyId = body?.company_id ? String(body.company_id) : null;
    const ano = body?.ano != null ? Number(body.ano) : null;
    const mes = body?.mes != null ? Number(body.mes) : null;
    const statuses: string[] = Array.isArray(body?.statuses) && body.statuses.length
      ? body.statuses.map((s: unknown) => String(s)) : DEFAULT_STATUSES;
    const limit = Math.min(Number(body?.limit ?? 500), 2000);
    const dryRun = !!body?.dry_run;

    if (!rmaId && !companyId) return json(400, { error: "rma_id ou company_id é obrigatório" });

    // Consultor: precisa ter acesso à empresa
    if (!isPriv && set.has("consultor") && companyId) {
      const { data: cc } = await sb.from("company_consultants").select("id")
        .eq("company_id", companyId).eq("consultant_user_id", userId).maybeSingle();
      if (!cc) {
        const { data: comp } = await sb.from("companies").select("created_by").eq("id", companyId).maybeSingle();
        if (comp?.created_by !== userId) return json(403, { error: "forbidden" });
      }
    }

    let q = sb.from("onedrive_files")
      .select("file_id, company_id, rma_id, ano, mes, path, file_name, status, reprocess_count")
      .in("status", statuses).limit(limit);
    if (rmaId) q = q.eq("rma_id", rmaId);
    if (companyId) q = q.eq("company_id", companyId);
    if (ano != null) q = q.eq("ano", ano);
    if (mes != null) q = q.eq("mes", mes);

    const { data: files, error: fErr } = await q;
    if (fErr) return json(500, { error: "list_failed", message: fErr.message });

    if (dryRun) {
      return json(200, {
        total: files?.length ?? 0,
        dry_run: true,
        sample: (files ?? []).slice(0, 20).map((f) => ({ file_id: f.file_id, status: f.status, path: f.path })),
      });
    }

    let queued = 0, failed = 0, skipped = 0;
    const items: Array<{ file_id: string; ok: boolean; reason?: string }> = [];

    // Throttle: 5 em paralelo
    const all = files ?? [];
    for (let i = 0; i < all.length; i += 5) {
      const batch = all.slice(i, i + 5);
      const results = await Promise.allSettled(batch.map(async (f) => {
        // cancela jobs travados desse arquivo
        await sb.from("processing_queue").update({
          status: "cancelled",
          error_message: "Cancelado por bulk-reprocess",
          updated_at: new Date().toISOString(),
        }).eq("file_id", f.file_id).in("status", ["pending", "processing"]);

        await sb.from("onedrive_files").update({
          status: "queued",
          error_message: null,
          last_processed_at: null,
          reprocess_count: Number(f.reprocess_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        }).eq("file_id", f.file_id);

        const { error: qErr } = await sb.from("processing_queue").insert({
          file_id: f.file_id, company_id: f.company_id, rma_id: f.rma_id,
          ano: f.ano, mes: f.mes, reason: "bulk_reprocess",
          status: "pending", priority: 10,
          payload: { path: f.path, file_name: f.file_name, triggered_by: userId, source: "bulk-reprocess" },
        });
        if (qErr) throw new Error(qErr.message);
        return f.file_id;
      }));
      for (let k = 0; k < results.length; k++) {
        const r = results[k];
        const fid = batch[k].file_id;
        if (r.status === "fulfilled") { queued++; items.push({ file_id: fid, ok: true }); }
        else { failed++; items.push({ file_id: fid, ok: false, reason: String((r as any).reason?.message ?? r) }); }
      }
      await new Promise((res) => setTimeout(res, 200));
    }

    triggerWorker(supaUrl, serviceKey);

    return json(200, {
      total: all.length, queued, failed, skipped,
      filter: { rma_id: rmaId, company_id: companyId, ano, mes, statuses, limit },
      sample: items.slice(0, 30),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bulk-reprocess] error:", msg);
    return json(500, { error: "bulk_failed", message: msg });
  }
});
