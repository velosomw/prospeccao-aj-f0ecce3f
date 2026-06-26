// Edge Function: onedrive-upload
// Permite que perfis Recuperanda (e demais com acesso à empresa) enviem
// arquivos para a pasta OneDrive da empresa em "Projeto RMA/<empresa>/<ano>/<MM.YYYY>/<tópico>/<arquivo>"
// e dispara automaticamente o pipeline de leitura (Delta Engine + queue worker).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ONEDRIVE_CONFIG,
  assertWithinBase,
  resolveRoot,
  listChildren,
  ensureFolder,
  validateFile,
  audit,
  getServiceClient,
} from "../_shared/onedrive.ts";
import { getAppToken } from "../_shared/graph-app.ts";
import { trackAndEnqueue, type OneDriveFileDescriptor } from "../_shared/delta-engine.ts";

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

function base64ToBytes(b64: string): Uint8Array {
  // Aceita data URL ("data:...;base64,XXXX") ou base64 puro
  const cleaned = b64.includes(",") ? b64.split(",").pop()! : b64;
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function uploadSmall(driveId: string, parentId: string, fileName: string, bytes: Uint8Array, mimeType: string) {
  const token = await getAppToken();
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}:/${encodeURIComponent(fileName)}:/content?@microsoft.graph.conflictBehavior=replace`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType || "application/octet-stream",
    },
    body: bytes,
  });
  const text = await resp.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!resp.ok) throw new Error(`Graph upload error [${resp.status}]: ${JSON.stringify(data?.error || data).slice(0, 500)}`);
  return data;
}

async function uploadLarge(driveId: string, parentId: string, fileName: string, bytes: Uint8Array) {
  const token = await getAppToken();
  const sessionUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}:/${encodeURIComponent(fileName)}:/createUploadSession`;
  const sresp = await fetch(sessionUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace", name: fileName } }),
  });
  const sdata = await sresp.json();
  if (!sresp.ok) throw new Error(`createUploadSession [${sresp.status}]: ${JSON.stringify(sdata).slice(0, 500)}`);
  const uploadUrl: string = sdata.uploadUrl;
  const CHUNK = 5 * 1024 * 1024; // 5MB
  let last: any = null;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    const chunk = bytes.slice(start, end);
    const cresp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}`,
      },
      body: chunk,
    });
    if (!cresp.ok && cresp.status !== 202) {
      const t = await cresp.text();
      throw new Error(`chunk upload [${cresp.status}]: ${t.slice(0, 300)}`);
    }
    if (cresp.ok) last = await cresp.json();
  }
  return last;
}

async function userCanUploadForCompany(userClient: ReturnType<typeof createClient>, sb: ReturnType<typeof createClient>, userId: string, companyId: string) {
  // Gestor IA / Coordenador / Magistrado: liberados
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const set = new Set((roles || []).map((r: any) => r.role));
  if (set.has("gestor_ia") || set.has("coordenador") || set.has("magistrado")) return true;

  // Consultor responsável pela empresa
  if (set.has("consultor")) {
    const { data: cc } = await sb
      .from("company_consultants")
      .select("id")
      .eq("company_id", companyId)
      .eq("consultant_user_id", userId)
      .maybeSingle();
    if (cc) return true;
    const { data: comp } = await sb.from("companies").select("created_by").eq("id", companyId).maybeSingle();
    if (comp?.created_by === userId) return true;
  }

  // Admjudicial vinculado
  if (set.has("admjudicial")) {
    // empresas vinculadas via recuperandas dele
    const { data: links } = await sb
      .from("admjudicial_recuperandas")
      .select("recuperanda_user_id")
      .eq("admjudicial_user_id", userId);
    const recIds = (links || []).map((l: any) => l.recuperanda_user_id);
    if (recIds.length > 0) {
      const { data: rels } = await sb
        .from("rma_release_assignments")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "active")
        .in("released_to_user_id", recIds);
      if (rels && rels.length > 0) return true;
    }
  }

  // Recuperanda: precisa ter release_assignment ativo
  if (set.has("recuperanda")) {
    const { data: rel } = await sb
      .from("rma_release_assignments")
      .select("id")
      .eq("company_id", companyId)
      .eq("released_to_user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (rel) return true;
  }

  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const startedAt = Date.now();
  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { error: "missing_token" });

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supaUrl, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userResp, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userResp?.user) return json(401, { error: "invalid_token" });
    const userId = userResp.user.id;

    const sb = getServiceClient();

    // ── Body ──────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      company_id,
      topic,                 // ex: "09 - Demonstrações Contábeis" (será criada se não existir)
      file_name,
      mime_type,
      content_base64,        // conteúdo do arquivo
      year: bodyYear,
      month: bodyMonth,
      rma_id: bodyRmaId,
    } = body || {};

    if (!company_id) return json(400, { error: "company_id obrigatório" });
    if (!file_name) return json(400, { error: "file_name obrigatório" });
    if (!content_base64) return json(400, { error: "content_base64 obrigatório" });
    if (!topic || String(topic).trim().length === 0) return json(400, { error: "topic obrigatório" });

    // ── Permissão ─────────────────────────────────────────────
    const allowed = await userCanUploadForCompany(userClient, sb, userId, company_id);
    if (!allowed) return json(403, { error: "forbidden", message: "Sem permissão para enviar arquivos a esta empresa." });

    // ── Empresa ───────────────────────────────────────────────
    const { data: comp, error: cErr } = await sb
      .from("companies")
      .select("id,name,rma_id,execution_year,current_period_month")
      .eq("id", company_id)
      .maybeSingle();
    if (cErr || !comp) return json(404, { error: "company_not_found" });

    const now = new Date();
    const yearNum = Number(bodyYear ?? comp.execution_year ?? now.getFullYear());
    const monthNum = Number(bodyMonth ?? comp.current_period_month ?? (now.getMonth() + 1));
    const periodStr = `${String(monthNum).padStart(2, "0")}.${yearNum}`;
    const rmaId = bodyRmaId || comp.rma_id || "RMA-001";
    const clientName = comp.name;

    // ── Decode + valida ───────────────────────────────────────
    const bytes = base64ToBytes(String(content_base64));
    const sizeBytes = bytes.length;
    const v = validateFile(file_name, sizeBytes); // throws se inválido

    // ── Resolve / cria hierarquia OneDrive ────────────────────
    const root = await resolveRoot();
    if (!root.driveId || !root.itemId) throw new Error("Pasta base 'Projeto RMA' não resolvida");

    let cursorId = root.itemId;
    let cursorPath = ONEDRIVE_CONFIG.base_path;

    const ensureChild = async (parentId: string, name: string) => {
      const kids = await listChildren(root.driveId!, parentId);
      const found = kids.find((c: any) => c.folder && (c.name || "").toLowerCase() === name.toLowerCase());
      if (found) return found.id as string;
      const created = await ensureFolder(root.driveId!, parentId, name);
      return created.id;
    };

    cursorId = await ensureChild(cursorId, clientName);
    cursorPath += `/${clientName}`;
    cursorId = await ensureChild(cursorId, String(yearNum));
    cursorPath += `/${yearNum}`;
    cursorId = await ensureChild(cursorId, periodStr);
    cursorPath += `/${periodStr}`;
    const topicName = String(topic).trim();
    cursorId = await ensureChild(cursorId, topicName);
    cursorPath += `/${topicName}`;

    assertWithinBase(cursorPath);

    // ── Upload ────────────────────────────────────────────────
    const SIMPLE_LIMIT = 4 * 1024 * 1024;
    const uploaded = sizeBytes <= SIMPLE_LIMIT
      ? await uploadSmall(root.driveId!, cursorId, file_name, bytes, mime_type || "application/octet-stream")
      : await uploadLarge(root.driveId!, cursorId, file_name, bytes);

    const fileItemId: string = uploaded?.id;
    const finalName: string = uploaded?.name ?? file_name;
    const finalSize: number = uploaded?.size ?? sizeBytes;
    const etag: string | null = uploaded?.eTag ?? uploaded?.cTag ?? null;
    const lastModified: string | null = uploaded?.lastModifiedDateTime ?? null;

    // ── Registra no Delta Engine + enfileira ──────────────────
    const descriptor: OneDriveFileDescriptor = {
      file_id: fileItemId,
      drive_id: root.driveId!,
      path: `${cursorPath}/${finalName}`,
      file_name: finalName,
      file_type: v.ext,
      mime_type: mime_type || "application/octet-stream",
      size_bytes: finalSize,
      etag,
      ctag: uploaded?.cTag ?? null,
      last_modified: lastModified,
      company_id,
      rma_id: rmaId,
      ano: yearNum,
      mes: monthNum,
      metadata: {
        topic_folder: topicName,
        sync_path: cursorPath,
        uploaded_by: userId,
        source: "recuperanda_upload",
      },
    };

    const decision = await trackAndEnqueue(descriptor, { scanId: crypto.randomUUID() });

    // pipeline_documents (idempotente)
    const { data: existingDoc } = await sb
      .from("pipeline_documents")
      .select("id")
      .eq("rma_id", rmaId)
      .eq("external_id", fileItemId)
      .maybeSingle();
    if (!existingDoc) {
      await sb.from("pipeline_documents").insert({
        rma_id: rmaId,
        file_name: finalName,
        mime_type: mime_type || "application/octet-stream",
        file_size: finalSize,
        sha256_hash: `onedrive:${fileItemId}`,
        provider: "onedrive",
        external_id: fileItemId,
        pipeline_status: "pending",
        pipeline_step: 0,
      });
    }

    triggerQueueWorker();

    await audit({
      documentId: null,
      step: "onedrive_upload",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: {
        company_id, rma_id: rmaId, year: yearNum, month: monthNum,
        topic: topicName, file_name: finalName, size: finalSize,
        decision: decision.action, uploaded_by: userId,
      },
    });

    return json(200, {
      ok: true,
      file: {
        id: fileItemId,
        name: finalName,
        size: finalSize,
        path: `${cursorPath}/${finalName}`,
        webUrl: uploaded?.webUrl ?? null,
      },
      delta: decision,
      period: { year: yearNum, month: monthNum, period: periodStr, rma_id: rmaId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[onedrive-upload] error:", msg);
    try {
      await audit({
        documentId: null,
        step: "onedrive_upload",
        status: "error",
        durationMs: Date.now() - startedAt,
        errorMessage: msg,
      });
    } catch { /* noop */ }
    return json(500, { error: "upload_failed", message: msg });
  }
});
