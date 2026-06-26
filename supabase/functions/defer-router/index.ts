// defer-router — Roteador inteligente por mime_type.
//
// PDF       → deferred_jobs (DocAI Batch). Se >20MB OU page>15 e conhecemos pages, marca needs_split.
// XLSX/XLS  → invoca xlsx-worker (sync) e retorna mode='excel'.
// CSV       → mesmo caminho do xlsx-worker.
// TXT/SPED  → invoca sped-worker (sync) e retorna mode='sped'.
// 0 bytes   → marca file como manual_upload_required (arquivo_corrompido_origem).
// Demais    → critério legado (should_defer_file).
//
// POST { file_id, company_id, rma_id, folder_path, file_name, mime_type, size_bytes, pages?, document_id?, payload? }
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

interface RouterInput {
  file_id: string;
  company_id?: string | null;
  rma_id?: string | null;
  folder_path?: string | null;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  pages?: number | null;
  document_id?: string | null;
  payload?: Record<string, unknown>;
}

const PDF_SPLIT_PAGES = 15;
const PDF_SPLIT_SIZE_BYTES = 20 * 1024 * 1024;

function isPdf(mime: string | null | undefined, name: string) {
  return (mime || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(name);
}
function isExcel(mime: string | null | undefined, name: string) {
  const m = (mime || "").toLowerCase();
  return m.includes("spreadsheetml") || m.includes("ms-excel") || /\.(xlsx?|csv)$/i.test(name);
}
function isSpedOrText(mime: string | null | undefined, name: string) {
  const m = (mime || "").toLowerCase();
  return m.startsWith("text/") || /\.(txt|sped)$/i.test(name);
}

async function invoke(fn: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: r.ok, status: r.status, body: json, raw: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json()) as RouterInput;
    if (!body?.file_id || !body?.file_name) {
      return new Response(JSON.stringify({ error: "file_id e file_name obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const size = body.size_bytes ?? 0;

    // Arquivo vazio: corrupção na origem
    if (size === 0) {
      await supabase.rpc("mark_file_manual_upload_required", {
        p_file_id: body.file_id,
        p_reason: "arquivo_corrompido_origem (0 bytes)",
      });
      return new Response(JSON.stringify({ mode: "manual_upload_required", reason: "zero_bytes" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // XLSX / CSV → worker dedicado (sync)
    if (isExcel(body.mime_type, body.file_name)) {
      const r = await invoke("xlsx-worker", {
        file_id: body.file_id, company_id: body.company_id, rma_id: body.rma_id,
        folder_path: body.folder_path, file_name: body.file_name,
        document_id: body.document_id, payload: body.payload,
      });
      return new Response(JSON.stringify({ mode: "excel", ok: r.ok, status: r.status, result: r.body }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SPED / TXT → worker dedicado (sync)
    if (isSpedOrText(body.mime_type, body.file_name)) {
      const r = await invoke("sped-worker", {
        file_id: body.file_id, company_id: body.company_id, rma_id: body.rma_id,
        folder_path: body.folder_path, file_name: body.file_name,
        document_id: body.document_id, payload: body.payload,
      });
      return new Response(JSON.stringify({ mode: "sped", ok: r.ok, status: r.status, result: r.body }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // PDF → ramo DocAI Batch (com pré-split se necessário)
    if (isPdf(body.mime_type, body.file_name)) {
      const needsSplit = size > PDF_SPLIT_SIZE_BYTES
        || (typeof body.pages === "number" && body.pages > PDF_SPLIT_PAGES);

      // Enfileira como deferred_job (sempre). Se needsSplit, marca payload.needs_split=true para o
      // docai-batch-poll redirecionar ao splitter antes de submeter.
      const enrichedPayload = { ...(body.payload ?? {}), needs_split: needsSplit };
      const { data: jobId, error: enqErr } = await supabase.rpc("enqueue_deferred_job", {
        p_file_id: body.file_id,
        p_company_id: body.company_id ?? null,
        p_rma_id: body.rma_id ?? null,
        p_folder_path: body.folder_path ?? null,
        p_file_name: body.file_name,
        p_mime_type: body.mime_type ?? "application/pdf",
        p_size_bytes: size,
        p_pages: body.pages ?? null,
        p_document_id: body.document_id ?? null,
        p_payload: enrichedPayload,
      });
      if (enqErr) throw enqErr;

      // Ajusta eta_at para "agora" quando precisa split (não esperar off-peak)
      if (needsSplit) {
        await supabase.from("deferred_jobs").update({
          eta_at: new Date().toISOString(),
        }).eq("id", jobId);
      }

      const { data: jobRow } = await supabase
        .from("deferred_jobs")
        .select("id, eta_at, status, file_size_bytes")
        .eq("id", jobId).maybeSingle();

      return new Response(JSON.stringify({
        mode: needsSplit ? "deferred_split" : "deferred",
        deferred_job_id: jobId,
        needs_split: needsSplit,
        eta_at: jobRow?.eta_at ?? null,
        status: jobRow?.status ?? "queued",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback: critério antigo
    const { data: shouldDefer, error: rErr } = await supabase.rpc("should_defer_file", {
      p_size_bytes: size, p_pages: body.pages ?? null,
    });
    if (rErr) throw rErr;
    if (!shouldDefer) {
      return new Response(JSON.stringify({ mode: "sync" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: jobId, error: e2 } = await supabase.rpc("enqueue_deferred_job", {
      p_file_id: body.file_id, p_company_id: body.company_id ?? null,
      p_rma_id: body.rma_id ?? null, p_folder_path: body.folder_path ?? null,
      p_file_name: body.file_name, p_mime_type: body.mime_type ?? null,
      p_size_bytes: size, p_pages: body.pages ?? null,
      p_document_id: body.document_id ?? null, p_payload: body.payload ?? {},
    });
    if (e2) throw e2;
    return new Response(JSON.stringify({ mode: "deferred", deferred_job_id: jobId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[defer-router]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
