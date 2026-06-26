// Edge Function: reprocess-file
// Re-enfileira um arquivo do OneDrive já registrado, quando o pipeline anterior falhou.
// Permissões: Gestor IA, Coordenador, Magistrado, Consultor responsável e Recuperanda
// liberada para a empresa.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function triggerQueueWorker() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  fetch(`${url}/functions/v1/process-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ batch_size: 5 }),
  }).catch((e) => console.error("triggerQueueWorker failed", e));
}

async function userCanAccessCompany(sb: ReturnType<typeof createClient>, userId: string, companyId: string) {
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const set = new Set((roles || []).map((r: any) => r.role));
  if (set.has("gestor_ia") || set.has("coordenador") || set.has("magistrado")) return true;

  if (set.has("consultor")) {
    const { data: cc } = await sb.from("company_consultants").select("id")
      .eq("company_id", companyId).eq("consultant_user_id", userId).maybeSingle();
    if (cc) return true;
    const { data: comp } = await sb.from("companies").select("created_by").eq("id", companyId).maybeSingle();
    if (comp?.created_by === userId) return true;
  }

  if (set.has("recuperanda")) {
    const { data: rel } = await sb.from("rma_release_assignments").select("id")
      .eq("company_id", companyId).eq("released_to_user_id", userId)
      .eq("status", "active").limit(1).maybeSingle();
    if (rel) return true;
  }

  if (set.has("admjudicial")) {
    const { data: links } = await sb.from("admjudicial_recuperandas")
      .select("recuperanda_user_id").eq("admjudicial_user_id", userId);
    const recIds = (links || []).map((l: any) => l.recuperanda_user_id);
    if (recIds.length > 0) {
      const { data: rels } = await sb.from("rma_release_assignments").select("id")
        .eq("company_id", companyId).eq("status", "active").in("released_to_user_id", recIds);
      if (rels && rels.length > 0) return true;
    }
  }

  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "missing_token" });

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userResp, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userResp?.user) return json(401, { error: "invalid_token" });
    const userId = userResp.user.id;

    const sb = createClient(supaUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const fileId = String(body?.file_id || "").trim();
    if (!fileId) return json(400, { error: "file_id obrigatório" });

    const { data: f, error: fErr } = await sb.from("onedrive_files")
      .select("file_id,company_id,rma_id,ano,mes,path,file_name,status,reprocess_count")
      .eq("file_id", fileId).maybeSingle();
    if (fErr || !f) return json(404, { error: "file_not_found" });

    if (!f.company_id) return json(400, { error: "file_missing_company" });
    const allowed = await userCanAccessCompany(sb, userId, f.company_id as string);
    if (!allowed) return json(403, { error: "forbidden" });

    // Verifica roles para bypass do limite
    const { data: rolesData } = await sb.from("user_roles").select("role").eq("user_id", userId);
    const roleSet = new Set((rolesData || []).map((r: any) => r.role));
    const isGestor = roleSet.has("gestor_ia");
    // Bypass do limite: gestor, coordenador e magistrado
    const canBypassLimit = isGestor || roleSet.has("coordenador") || roleSet.has("magistrado");

    // Limite global de tentativas
    const { data: cfg } = await sb.from("worker_config")
      .select("max_reprocess_attempts").eq("id", "default").maybeSingle();
    const maxAttempts = Number((cfg as any)?.max_reprocess_attempts ?? 3);
    const currentCount = Number((f as any).reprocess_count ?? 0);

    const primaryRole = isGestor ? "gestor_ia"
      : roleSet.has("coordenador") ? "coordenador"
      : roleSet.has("magistrado") ? "magistrado"
      : roleSet.has("consultor") ? "consultor"
      : roleSet.has("recuperanda") ? "recuperanda"
      : roleSet.has("admjudicial") ? "admjudicial"
      : "autenticado";

    if (!canBypassLimit && currentCount >= maxAttempts) {
      await sb.from("reprocess_audit_log").insert({
        file_id: fileId,
        company_id: f.company_id,
        rma_id: f.rma_id,
        user_id: userId,
        user_role: primaryRole,
        action: "blocked",
        reason: "max_reprocess_reached",
        attempt_number: currentCount,
        max_attempts: maxAttempts,
        metadata: { file_name: f.file_name, path: f.path },
      });
      return json(429, {
        error: "max_reprocess_reached",
        message: `Limite de ${maxAttempts} reprocessamentos atingido. Solicite ao Gestor IA.`,
        reprocess_count: currentCount,
        max_attempts: maxAttempts,
      });
    }

    // Cancela jobs travados/órfãos
    await sb.from("processing_queue").update({
      status: "cancelled",
      error_message: "Cancelado por reprocessamento manual",
      updated_at: new Date().toISOString(),
    }).eq("file_id", fileId).in("status", ["pending", "processing"]);

    // Reseta tracker e incrementa contador
    await sb.from("onedrive_files").update({
      status: "queued",
      error_message: null,
      last_processed_at: null,
      reprocess_count: currentCount + 1,
      updated_at: new Date().toISOString(),
    }).eq("file_id", fileId);

    // Enfileira novamente com prioridade alta
    const { data: queued, error: qErr } = await sb.from("processing_queue").insert({
      file_id: fileId,
      company_id: f.company_id,
      rma_id: f.rma_id,
      ano: f.ano,
      mes: f.mes,
      reason: "manual_reprocess",
      status: "pending",
      priority: 10,
      payload: {
        path: f.path,
        file_name: f.file_name,
        triggered_by: userId,
        source: "reprocess-file",
      },
    }).select("id").maybeSingle();
    if (qErr) throw qErr;

    triggerQueueWorker();

    await sb.from("reprocess_audit_log").insert({
      file_id: fileId,
      company_id: f.company_id,
      rma_id: f.rma_id,
      user_id: userId,
      user_role: primaryRole,
      action: "allowed",
      reason: canBypassLimit && currentCount >= maxAttempts ? "role_bypass" : "manual_reprocess",
      attempt_number: currentCount + 1,
      max_attempts: maxAttempts,
      metadata: { file_name: f.file_name, path: f.path, queue_id: queued?.id },
    });

    return json(200, {
      ok: true,
      queue_id: queued?.id,
      file_id: fileId,
      reprocess_count: currentCount + 1,
      max_attempts: maxAttempts,
      remaining: Math.max(0, maxAttempts - (currentCount + 1)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reprocess-file] error:", msg);
    return json(500, { error: "reprocess_failed", message: msg });
  }
});
