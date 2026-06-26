// pdf-page-splitter — STREAMING: baixa OneDrive → GCS por chunks (sem buffer total),
// conta páginas via regex byte-a-byte, cria N child deferred_jobs apontando para o
// MESMO gcs_input_uri com payload.page_range. O docai-batch-poll usa
// processOptions.individualPageSelector para processar só o range do chunk.
//
// Memória estável (~16MB) mesmo para PDFs de 30MB+. Sem pdf-lib.
//
// POST { file_id, deferred_job_id?, max_pages_per_chunk?: number = 15 }
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { graphApp, getAppCreds } from "../_shared/graph-app.ts";
import { getGcpAccessToken } from "../_shared/gcp-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GCS_BUCKET = Deno.env.get("GCS_DOCAI_BUCKET") || "";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

interface Body {
  file_id: string;
  deferred_job_id?: string | null;
  max_pages_per_chunk?: number;
}

async function getDownloadUrl(fileId: string, driveId?: string | null): Promise<string> {
  const select = "id,name,file,@microsoft.graph.downloadUrl";
  const tries: string[] = [];
  if (driveId) tries.push(`drives/${driveId}/items/${fileId}?select=${select}`);
  const { userUpn } = getAppCreds();
  tries.push(`users/${encodeURIComponent(userUpn)}/drive/items/${fileId}?select=${select}`);
  let lastErr: unknown = null;
  for (const path of tries) {
    try {
      const meta = await graphApp<{ "@microsoft.graph.downloadUrl"?: string }>(path);
      const dl = meta["@microsoft.graph.downloadUrl"];
      if (!dl) throw new Error("sem downloadUrl");
      return dl;
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Resumable upload session ao GCS. Retorna URL para PUT incremental. */
async function gcsResumableStart(bucket: string, objectPath: string, contentType: string): Promise<string> {
  const token = await getGcpAccessToken();
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=resumable&name=${encodeURIComponent(objectPath)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
    },
    body: JSON.stringify({ name: objectPath }),
  });
  if (!resp.ok) throw new Error(`GCS resumable init [${resp.status}]: ${(await resp.text()).slice(0, 300)}`);
  const session = resp.headers.get("Location");
  if (!session) throw new Error("GCS resumable: Location ausente");
  return session;
}

/** Faz stream OneDrive → GCS em janelas de ~8MB; conta /Type /Page no caminho. */
async function streamOneDriveToGcs(
  downloadUrl: string,
  bucket: string,
  objectPath: string,
): Promise<{ totalBytes: number; pageCount: number }> {
  const session = await gcsResumableStart(bucket, objectPath, "application/pdf");

  const dl = await fetch(downloadUrl);
  if (!dl.ok || !dl.body) throw new Error(`download falhou [${dl.status}]`);
  const totalHeader = dl.headers.get("content-length");
  const totalBytes = totalHeader ? parseInt(totalHeader, 10) : -1;

  const reader = dl.body.getReader();
  const WINDOW = 8 * 1024 * 1024; // 8MB por PUT
  let buf = new Uint8Array(0);
  let offset = 0;
  let pageCount = 0;
  let carry = new Uint8Array(0); // últimos 16 bytes para regex cross-chunk

  // Regex em ASCII: "/Type /Page" não seguido de "s" (evita /Pages)
  const PAGE_RE = /\/Type\s*\/Page(?![s\w])/g;

  const flush = async (final: boolean) => {
    if (buf.length === 0 && !final) return;
    const start = offset;
    const end = offset + buf.length - 1;
    const totalStr = final ? String(offset + buf.length) : "*";
    const range = buf.length === 0 ? `bytes */${totalStr}` : `bytes ${start}-${end}/${totalStr}`;
    const r = await fetch(session, {
      method: "PUT",
      headers: { "Content-Range": range, "Content-Length": String(buf.length) },
      body: buf.length === 0 ? null : buf,
    });
    // 308 = continue (esperado para parciais); 200/201 = final OK
    if (![200, 201, 308].includes(r.status)) {
      throw new Error(`GCS PUT [${r.status}] range=${range}: ${(await r.text()).slice(0, 200)}`);
    }
    offset += buf.length;
    buf = new Uint8Array(0);
  };

  const append = (chunk: Uint8Array) => {
    const merged = new Uint8Array(buf.length + chunk.length);
    merged.set(buf, 0);
    merged.set(chunk, buf.length);
    buf = merged;
  };

  const countPagesIn = (chunk: Uint8Array) => {
    // Concatena carry + chunk só para regex (ASCII-safe sobre bytes)
    const combined = new Uint8Array(carry.length + chunk.length);
    combined.set(carry, 0);
    combined.set(chunk, carry.length);
    const text = new TextDecoder("latin1").decode(combined);
    const m = text.match(PAGE_RE);
    if (m) pageCount += m.length;
    // mantém últimos 16 bytes como carry
    carry = chunk.length >= 16
      ? chunk.slice(chunk.length - 16)
      : combined.slice(combined.length - 16);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value || value.length === 0) continue;
    countPagesIn(value);
    append(value);
    if (buf.length >= WINDOW) {
      // PUT só múltiplos de 256KB (GCS requirement para chunks intermediários)
      const slice = Math.floor(buf.length / (256 * 1024)) * (256 * 1024);
      if (slice > 0) {
        const sendNow = buf.slice(0, slice);
        const rest = buf.slice(slice);
        buf = sendNow;
        await flush(false);
        buf = rest;
      }
    }
  }
  // Final: envia o que sobrou (qualquer tamanho)
  await flush(true);

  return { totalBytes: offset, pageCount: Math.max(pageCount, 1) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body?.file_id) throw new Error("file_id obrigatório");
    const maxPages = Math.max(2, Math.min(body.max_pages_per_chunk ?? 15, 50));
    if (!GCS_BUCKET) throw new Error("GCS_DOCAI_BUCKET não configurado");

    const { data: of } = await supabase
      .from("onedrive_files")
      .select("file_id, drive_id, file_name, mime_type, path, company_id, rma_id")
      .eq("file_id", body.file_id).maybeSingle();
    if (!of) throw new Error(`onedrive_files não encontrado para ${body.file_id}`);

    let parentJob: any = null;
    if (body.deferred_job_id) {
      const { data } = await supabase
        .from("deferred_jobs").select("*").eq("id", body.deferred_job_id).maybeSingle();
      parentJob = data;
    }

    // Idempotência
    const { data: existing } = await supabase
      .from("pdf_split_jobs").select("*")
      .eq("parent_file_id", body.file_id)
      .not("status", "in", "(failed,cancelled)").maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({
        ok: true, reused: true, parent_split_job_id: existing.id,
        total_chunks: existing.total_chunks, status: existing.status,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[splitter] streaming ${of.file_name} → GCS`);
    const downloadUrl = await getDownloadUrl(body.file_id, of.drive_id);
    const sharedPath = `input/shared/${body.file_id}.pdf`;
    const { totalBytes, pageCount } = await streamOneDriveToGcs(downloadUrl, GCS_BUCKET, sharedPath);
    const sharedUri = `gs://${GCS_BUCKET}/${sharedPath}`;
    console.log(`[splitter] streamed ${totalBytes}B, pages~${pageCount}`);

    const totalChunks = Math.max(1, Math.ceil(pageCount / maxPages));
    if (totalChunks <= 1) {
      // PDF pequeno o suficiente — só processa inteiro reaproveitando gcs_input_uri
      if (parentJob?.id) {
        await supabase.from("deferred_jobs").update({
          gcs_input_uri: sharedUri, file_size_bytes: totalBytes,
          page_count_estimate: pageCount, status: "queued",
          eta_at: new Date().toISOString(), error_message: null,
        }).eq("id", parentJob.id);
      }
      return new Response(JSON.stringify({
        ok: true, single_chunk: true, pages: pageCount, gcs_input_uri: sharedUri,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: splitJob, error: sErr } = await supabase
      .from("pdf_split_jobs").insert({
        parent_file_id: body.file_id,
        parent_deferred_job_id: parentJob?.id ?? null,
        parent_document_id: parentJob?.document_id ?? null,
        total_chunks: totalChunks, chunks_done: 0, status: "processing",
        rma_id: of.rma_id, company_id: of.company_id,
      }).select("*").single();
    if (sErr) throw sErr;

    const chunkRows: any[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * maxPages + 1; // DocAI usa 1-indexado
      const end = Math.min(start + maxPages - 1, pageCount);
      const childFileId = `${body.file_id}__chunk${i + 1}`;
      const fname = (of.file_name || "doc").replace(/\.pdf$/i, "");
      const safeName = `${fname}__pp${start}-${end}.pdf`.replace(/[^\w.\-]/g, "_");
      const { data: childJob, error: cErr } = await supabase
        .from("deferred_jobs").insert({
          file_id: childFileId,
          company_id: of.company_id, rma_id: of.rma_id, folder_path: of.path,
          file_name: safeName, mime_type: "application/pdf",
          file_size_bytes: totalBytes, page_count_estimate: end - start + 1,
          split_parent_id: parentJob?.id ?? null,
          chunk_index: i + 1, chunks_total: totalChunks,
          gcs_input_uri: sharedUri, // compartilhado — submitJob honra page_range
          payload: {
            split_job_id: splitJob.id, parent_file_id: body.file_id,
            chunk_index: i + 1, chunks_total: totalChunks,
            from_splitter: true, page_range: [start, end],
          },
          status: "queued", eta_at: new Date().toISOString(),
        }).select("*").single();
      if (cErr) throw cErr;
      chunkRows.push({ deferred_job_id: childJob.id, chunk_index: i + 1, pages: [start, end] });
    }

    if (parentJob?.id) {
      await supabase.from("deferred_jobs").update({
        status: "split",
        error_message: `Substituído por ${totalChunks} chunks (${pageCount} páginas)`,
        completed_at: new Date().toISOString(),
      }).eq("id", parentJob.id);
    }

    return new Response(JSON.stringify({
      ok: true, parent_split_job_id: splitJob.id,
      total_chunks: totalChunks, page_count: pageCount, chunks: chunkRows,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[pdf-page-splitter]", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
