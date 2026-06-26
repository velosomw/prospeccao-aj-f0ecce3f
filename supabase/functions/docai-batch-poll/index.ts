// docai-batch-poll — Worker para Document AI Batch (cron 10min).
//
// Pipeline completo:
//   1. queued → download OneDrive → upload GCS (input/{job_id}/{file}) → POST :batchProcess → submitted
//   2. submitted/polling → GET operation; se done → lê JSON output do GCS → persiste ocr_results +
//      dispara ai-full-process → done
//   3. failed após max_attempts
//
// Secrets necessários: GCP_PROJECT_ID, GCP_LOCATION, GCP_DOCAI_PROCESSOR_ID, GCS_DOCAI_BUCKET, GCP_SA_KEY_JSON
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { graphApp, getAppCreds } from "../_shared/graph-app.ts";
import { getGcpAccessToken, gcsUpload, gcsList, gcsDownloadJson } from "../_shared/gcp-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GCS_BUCKET = Deno.env.get("GCS_DOCAI_BUCKET") || "";
const GCP_PROJECT = Deno.env.get("GCP_PROJECT_ID") || "";
const GCP_LOCATION = (Deno.env.get("GCP_LOCATION") || "us").toLowerCase();
const DOCAI_PROCESSOR_ID = Deno.env.get("GCP_DOCAI_PROCESSOR_ID") || "";

const HAS_INFRA = !!(GCS_BUCKET && GCP_PROJECT && DOCAI_PROCESSOR_ID && Deno.env.get("GCP_SA_KEY_JSON"));
const DOCAI_BASE = `https://${GCP_LOCATION}-documentai.googleapis.com/v1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/processors/${DOCAI_PROCESSOR_ID}`;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// ---------- helpers ----------

async function downloadFromOneDrive(fileId: string, driveId?: string | null): Promise<{ bytes: Uint8Array; mime: string; name: string }> {
  const select = "id,name,file,@microsoft.graph.downloadUrl";
  // Tenta primeiro via drive_id (caminho canônico para SharePoint/document libraries),
  // depois cai para users/{upn}/drive (OneDrive pessoal do usuário do app).
  const candidates: string[] = [];
  if (driveId) candidates.push(`drives/${driveId}/items/${fileId}?select=${select}`);
  const { userUpn } = getAppCreds();
  candidates.push(`users/${encodeURIComponent(userUpn)}/drive/items/${fileId}?select=${select}`);

  let lastErr: unknown = null;
  for (const path of candidates) {
    try {
      const meta = await graphApp<{ name: string; file?: { mimeType?: string }; "@microsoft.graph.downloadUrl"?: string }>(path);
      const dlUrl = meta["@microsoft.graph.downloadUrl"];
      if (!dlUrl) throw new Error(`OneDrive item ${fileId} sem downloadUrl`);
      const resp = await fetch(dlUrl);
      if (!resp.ok) throw new Error(`OneDrive download falhou [${resp.status}]`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      return { bytes, mime: meta.file?.mimeType || "application/pdf", name: meta.name || fileId };
    } catch (e) {
      lastErr = e;
      // tenta próximo candidato
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

interface DeferredJob {
  id: string;
  file_id: string;
  company_id: string | null;
  rma_id: string | null;
  folder_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  document_id: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  attempts: number;
  max_attempts: number;
  operation_name: string | null;
  gcs_input_uri: string | null;
  gcs_output_uri: string | null;
}

/** Extrai prefix (path dentro do bucket) de um gs://bucket/prefix/ URI */
function gsUriToPrefix(uri: string): string {
  return uri.replace(/^gs:\/\/[^/]+\//, "");
}

async function invokeSplitter(job: DeferredJob): Promise<void> {
  console.log(`[docai-batch] job ${job.id} → routing to pdf-page-splitter`);
  const r = await fetch(`${SUPABASE_URL}/functions/v1/pdf-page-splitter`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
    body: JSON.stringify({ file_id: job.file_id, deferred_job_id: job.id, max_pages_per_chunk: 15 }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`pdf-page-splitter [${r.status}]: ${text.slice(0, 400)}`);
  // splitter já marca o pai como status='split'; nada mais a fazer aqui
}

async function submitJob(job: DeferredJob): Promise<void> {
  console.log(`[docai-batch] submitting job ${job.id} file=${job.file_id}`);

  const payload = (job.payload || {}) as Record<string, unknown>;
  const isPdf = (job.mime_type || "").toLowerCase().includes("pdf")
    || /\.pdf$/i.test(job.file_name || "");

  // Pré-split: PDFs marcados como needs_split OU >20MB
  const SIZE_LIMIT = 20 * 1024 * 1024;
  const tooBig = (job.file_size_bytes ?? 0) > SIZE_LIMIT;
  if (isPdf && (payload.needs_split === true || tooBig) && !payload.from_splitter) {
    return invokeSplitter(job);
  }

  // Se o splitter já pré-subiu para GCS, reaproveita o gcs_input_uri.
  let inputUri = job.gcs_input_uri;
  let mime = job.mime_type || "application/pdf";
  if (!inputUri) {
    const { data: ofRow } = await supabase
      .from("onedrive_files").select("drive_id").eq("file_id", job.file_id).maybeSingle();
    const { bytes, mime: m2 } = await downloadFromOneDrive(job.file_id, ofRow?.drive_id ?? null);
    mime = m2;
    const inputPath = `input/${job.id}/${(job.file_name || "doc").replace(/[^\w.\-]/g, "_")}`;
    inputUri = await gcsUpload(GCS_BUCKET, inputPath, bytes, mime);
    console.log(`[docai-batch] uploaded ${inputUri} (${bytes.length} bytes)`);
  } else {
    console.log(`[docai-batch] reusing pre-uploaded ${inputUri}`);
  }
  const outputPrefix = `output/${job.id}/`;

  const token = await getGcpAccessToken();
  const body: Record<string, unknown> = {
    inputDocuments: { gcsDocuments: { documents: [{ gcsUri: inputUri, mimeType: mime }] } },
    documentOutputConfig: { gcsOutputConfig: { gcsUri: `gs://${GCS_BUCKET}/${outputPrefix}` } },
  };
  // Chunk de splitter: processa apenas o page_range (DocAI individualPageSelector)
  const pageRange = (payload.page_range as [number, number] | undefined);
  if (Array.isArray(pageRange) && pageRange.length === 2) {
    const [s, e] = pageRange;
    const pages: number[] = [];
    for (let p = s; p <= e; p++) pages.push(p);
    body.processOptions = { individualPageSelector: { pages } };
  }
  const resp = await fetch(`${DOCAI_BASE}:batchProcess`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const respText = await resp.text();
  let data: any = {};
  try { data = respText ? JSON.parse(respText) : {}; } catch { /* keep raw */ }
  if (!resp.ok) {
    // Falha por tamanho/páginas → tentar split (se ainda não veio do splitter)
    if (isPdf && !payload.from_splitter
        && /PAGE_LIMIT_EXCEEDED|INVALID_ARGUMENT|FAILED_PRECONDITION|too large|PAYLOAD/i.test(respText)) {
      console.warn(`[docai-batch] job ${job.id} too big → fallback splitter`);
      return invokeSplitter(job);
    }
    throw new Error(`batchProcess [${resp.status}]: ${respText.slice(0, 500) || "(empty body)"}`);
  }
  const opName = data.name as string;
  if (!opName) throw new Error(`batchProcess sem operation name: ${JSON.stringify(data).slice(0, 300)}`);

  await supabase.from("deferred_jobs").update({
    status: "submitted",
    operation_name: opName,
    gcs_input_uri: inputUri,
    gcs_output_uri: `gs://${GCS_BUCKET}/${outputPrefix}`,
    submitted_at: new Date().toISOString(),
  }).eq("id", job.id);
  console.log(`[docai-batch] job ${job.id} → submitted op=${opName}`);
}

async function pollJob(job: DeferredJob): Promise<void> {
  if (!job.operation_name) {
    await supabase.from("deferred_jobs").update({ status: "failed", error_message: "operation_name ausente" }).eq("id", job.id);
    return;
  }
  const token = await getGcpAccessToken();
  const resp = await fetch(`https://${GCP_LOCATION}-documentai.googleapis.com/v1/${job.operation_name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const op = await resp.json();
  if (!resp.ok) throw new Error(`operation get [${resp.status}]: ${JSON.stringify(op).slice(0, 400)}`);

  if (!op.done) {
    // Ainda processando — só toca updated_at via no-op update
    await supabase.from("deferred_jobs").update({ status: "polling" }).eq("id", job.id);
    return;
  }

  if (op.error) {
    const errStr = JSON.stringify(op.error);
    // Cascade para Vision quando DocAI rejeita o conteúdo (image-only PDFs, etc.)
    const isContentReject = /Failed to process all documents|UNSUPPORTED|INVALID_IMAGE/i.test(errStr);
    const alreadyCascaded = (job.payload as any)?.vision_cascade === true;
    if (isContentReject && !alreadyCascaded) {
      console.log(`[docai-batch] job ${job.id} DocAI rejected → cascading to ocr-google-vision`);
      try {
        // Baixa bytes do GCS (já estão lá) e manda como base64 (PDFs pequenos)
        const gcsPath = (job.gcs_input_uri || "").replace(/^gs:\/\/[^/]+\//, "");
        if (!gcsPath) throw new Error("gcs_input_uri ausente para cascade");
        const gToken = await getGcpAccessToken();
        const dl = await fetch(
          `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(GCS_BUCKET)}/o/${encodeURIComponent(gcsPath)}?alt=media`,
          { headers: { Authorization: `Bearer ${gToken}` } },
        );
        if (!dl.ok) throw new Error(`GCS download [${dl.status}]: ${(await dl.text()).slice(0,200)}`);
        const buf = new Uint8Array(await dl.arrayBuffer());
        // base64
        let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        const b64 = btoa(bin);
        const vRes = await supabase.functions.invoke("ocr-google-vision", {
          body: {
            fileBase64: b64, mimeType: "application/pdf",
            documentId: job.document_id || "00000000-0000-0000-0000-000000000000",
            rmaId: job.rma_id, persist: true, async: true,
            _source: "docai_cascade", _file_id: job.file_id,
          },
        });
        if (vRes.error) throw new Error(vRes.error.message || String(vRes.error));
        // Dispara ai-full-process após Vision
        supabase.functions.invoke("ai-full-process", {
          body: { file_id: job.file_id, company_id: job.company_id, rma_id: job.rma_id, _from_vision_cascade: true },
        }).catch((e) => console.warn(`[docai-batch] ai-full-process post-vision falhou: ${e}`));
        await supabase.from("deferred_jobs").update({
          status: "done", completed_at: new Date().toISOString(),
          payload: { ...(job.payload || {}), vision_cascade: true },
          error_message: null,
        }).eq("id", job.id);
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[docai-batch] vision cascade falhou: ${msg}`);
        await supabase.from("deferred_jobs").update({
          status: "failed",
          error_message: `DocAI rejeitou + Vision cascade falhou: ${msg.slice(0, 400)}`,
        }).eq("id", job.id);
        return;
      }
    }
    await supabase.from("deferred_jobs").update({
      status: "failed",
      error_message: `DocAI op error: ${errStr.slice(0, 500)}`,
    }).eq("id", job.id);
    return;
  }

  // 4. Lê outputs do GCS
  if (!job.gcs_output_uri) throw new Error("gcs_output_uri ausente");
  const prefix = gsUriToPrefix(job.gcs_output_uri);
  const objects = await gcsList(GCS_BUCKET, prefix);
  const jsonObjs = objects.filter((o) => o.name.endsWith(".json"));
  if (jsonObjs.length === 0) throw new Error(`Nenhum JSON em ${job.gcs_output_uri}`);

  let rawText = "";
  let pageCount = 0;
  for (const obj of jsonObjs) {
    const doc = await gcsDownloadJson<{ text?: string; pages?: unknown[] }>(GCS_BUCKET, obj.name);
    if (doc.text) rawText += doc.text + "\n";
    pageCount += (doc.pages?.length ?? 0);
  }

  // 5. Persiste em ocr_results
  await supabase.from("ocr_results").upsert({
    file_id: job.file_id,
    company_id: job.company_id,
    rma_id: job.rma_id,
    raw_text: rawText,
    page_count: pageCount,
    provider: "google_docai_batch",
    status: "completed",
    metadata: { operation: job.operation_name, gcs_output_uri: job.gcs_output_uri, deferred_job_id: job.id },
  }, { onConflict: "file_id" });

  // 6. Dispara ai-full-process (não bloqueia)
  supabase.functions.invoke("ai-full-process", {
    body: {
      file_id: job.file_id,
      company_id: job.company_id,
      rma_id: job.rma_id,
      ...(job.payload ?? {}),
      _from_batch: true,
    },
  }).catch((e) => console.warn(`[docai-batch] ai-full-process invoke falhou: ${e}`));

  await supabase.from("deferred_jobs").update({
    status: "done",
    completed_at: new Date().toISOString(),
  }).eq("id", job.id);
  console.log(`[docai-batch] job ${job.id} → done (${pageCount} pages, ${rawText.length} chars)`);

  // 7. Se é chunk de split, incrementa contador e dispara merge quando pronto
  const payload = (job.payload || {}) as Record<string, unknown>;
  if (payload.from_splitter && payload.parent_file_id) {
    const { data: splitState } = await supabase.rpc("pdf_split_increment_done", {
      p_parent_file_id: String(payload.parent_file_id),
    });
    console.log(`[docai-batch] chunk done; split=${JSON.stringify(splitState)}`);
    if (splitState?.status === "ready_to_merge") {
      fetch(`${SUPABASE_URL}/functions/v1/merge-chunks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
        body: JSON.stringify({ split_job_id: splitState.id }),
      }).catch((e) => console.warn("[docai-batch] merge-chunks invoke fail", e));
    }
  }
}

async function processOneCycle() {
  // Carrega config dinâmica (tamanho máx. de batch e janela off-peak)
  const { data: cfg } = await supabase
    .from("batch_processing_config")
    .select("max_batch_size, schedule_in_off_peak")
    .eq("id", 1)
    .maybeSingle();
  const batchLimit = Math.min(Math.max(cfg?.max_batch_size ?? 20, 1), 200);

  // Filtro: só pega jobs cujo eta_at já chegou (respeita janela off-peak no submit)
  const nowIso = new Date().toISOString();
  let query = supabase
    .from("deferred_jobs")
    .select("id, file_id, company_id, rma_id, folder_path, file_name, mime_type, file_size_bytes, document_id, payload, status, attempts, max_attempts, operation_name, gcs_input_uri, gcs_output_uri, eta_at")
    .in("status", ["queued", "submitted", "polling"])
    .order("created_at", { ascending: true })
    .limit(batchLimit);
  // submitted/polling sempre prossegue; queued só se eta_at <= now (ou null)
  // Aplicado em memória abaixo (mais simples que OR no PostgREST)
  const { data: jobs, error } = await query;

  if (error) {
    console.error("[docai-batch-poll] list error:", error.message);
    return { processed: 0, error: error.message };
  }

  const nowMs = Date.now();
  // Filtra: queued só roda se eta_at já chegou (respeita janela off-peak)
  const list = ((jobs ?? []) as (DeferredJob & { eta_at?: string | null })[]).filter((j) => {
    if (j.status !== "queued") return true;
    if (!j.eta_at) return true;
    return new Date(j.eta_at).getTime() <= nowMs;
  });
  if (list.length === 0) return { processed: 0, info: "nenhum job elegível agora", batchLimit };

  if (!HAS_INFRA) {
    console.log(`[docai-batch-poll] STUB MODE (infra GCP incompleta) — ${list.length} jobs aguardando`);
    return { processed: 0, stub: true, pending: list.length, batchLimit };
  }

  let ok = 0, fail = 0;
  for (const job of list) {
    try {
      if (job.status === "queued") await submitJob(job);
      else await pollJob(job); // submitted/polling
      ok++;
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[docai-batch-poll] job ${job.id} erro:`, msg);
      // 429 quota: NÃO consome tentativa — re-agenda com backoff de 60s
      if (/\[429\]|Quota limit|RESOURCE_EXHAUSTED/i.test(msg)) {
        await supabase.from("deferred_jobs").update({
          status: "queued",
          eta_at: new Date(Date.now() + 60_000).toISOString(),
          error_message: msg.slice(0, 1000),
        }).eq("id", job.id);
        continue;
      }
      const newAttempts = (job.attempts ?? 0) + 1;
      const finalFail = newAttempts >= (job.max_attempts ?? 5);
      await supabase.from("deferred_jobs").update({
        attempts: newAttempts,
        status: finalFail ? "failed" : job.status,
        error_message: msg.slice(0, 1000),
      }).eq("id", job.id);
    }

  }
  return { processed: list.length, ok, fail };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const result = await processOneCycle();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[docai-batch-poll]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
