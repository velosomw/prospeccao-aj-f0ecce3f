// merge-chunks — Consolida resultados de chunks.
// Dois modos:
//   A) split_job_id   → consolida chunks de PDF gerados pelo pdf-page-splitter
//                        (lê ocr_results de cada child file_id, concatena raw_text,
//                         persiste 1 ocr_results no parent_file_id, dispara ai-full-process)
//   B) parent_job_id  → modo legado (processing_queue chunks)
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function mergeSplitJob(splitJobId: string) {
  const { data: sj, error } = await supabase
    .from("pdf_split_jobs").select("*").eq("id", splitJobId).maybeSingle();
  if (error) throw error;
  if (!sj) throw new Error(`pdf_split_jobs ${splitJobId} not found`);
  if (sj.status === "merged" || sj.status === "completed") {
    return { ready: true, already_merged: true, split_job_id: splitJobId };
  }

  // Carrega chunks (deferred_jobs filhos done)
  const { data: chunks, error: cErr } = await supabase
    .from("deferred_jobs")
    .select("id, file_id, chunk_index, status, file_size_bytes")
    .eq("payload->>split_job_id", splitJobId)
    .order("chunk_index", { ascending: true });
  if (cErr) throw cErr;

  const done = (chunks || []).filter((c) => c.status === "done");
  if (done.length < sj.total_chunks) {
    return { ready: false, done: done.length, total: sj.total_chunks };
  }

  // Lê ocr_results de cada child file_id e concatena
  const childIds = done.map((c) => c.file_id);
  const { data: ocrs } = await supabase
    .from("ocr_results")
    .select("file_id, raw_text, page_count, metadata")
    .in("file_id", childIds);

  // Ordena por chunk_index original
  const orderMap = new Map(done.map((c, i) => [c.file_id, c.chunk_index ?? i]));
  const sorted = (ocrs || []).slice().sort(
    (a, b) => (orderMap.get(a.file_id) ?? 0) - (orderMap.get(b.file_id) ?? 0),
  );

  const mergedText = sorted
    .map((o, i) => `\n===== CHUNK ${orderMap.get(o.file_id) ?? i + 1}/${sj.total_chunks} =====\n${o.raw_text || ""}`)
    .join("\n");
  const pageCount = sorted.reduce((s, o) => s + (o.page_count || 0), 0);

  // Persiste OCR consolidado no parent_file_id
  await supabase.from("ocr_results").upsert({
    file_id: sj.parent_file_id,
    company_id: sj.company_id,
    rma_id: sj.rma_id,
    raw_text: mergedText,
    page_count: pageCount,
    provider: "google_docai_batch_merged",
    status: "completed",
    metadata: {
      split_job_id: sj.id,
      chunks: sj.total_chunks,
      child_file_ids: childIds,
    },
  }, { onConflict: "file_id" });

  // Marca pdf_split_jobs como merged
  await supabase.from("pdf_split_jobs").update({
    status: "merged",
    completed_at: new Date().toISOString(),
  }).eq("id", sj.id);

  // Reabilita o deferred_job pai (se ainda exists) como done
  if (sj.parent_deferred_job_id) {
    await supabase.from("deferred_jobs").update({
      status: "done",
      completed_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", sj.parent_deferred_job_id);
  }

  // Dispara ai-full-process sobre o documento pai
  fetch(`${SUPABASE_URL}/functions/v1/ai-full-process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
    body: JSON.stringify({
      file_id: sj.parent_file_id,
      document_id: sj.parent_document_id,
      company_id: sj.company_id,
      rma_id: sj.rma_id,
      _from_merged_split: true,
    }),
  }).catch((e) => console.warn("[merge-chunks] ai-full-process fail", e));

  return { ready: true, merged_chunks: sj.total_chunks, parent_file_id: sj.parent_file_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { split_job_id, parent_job_id } = body || {};

    // Modo A: split de PDF
    if (split_job_id) {
      const res = await mergeSplitJob(String(split_job_id));
      return new Response(JSON.stringify(res),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Modo B: legado processing_queue
    if (!parent_job_id) {
      return new Response(JSON.stringify({ error: "split_job_id ou parent_job_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: chunks, error } = await supabase
      .from("processing_queue")
      .select("id, status, chunk_index, payload")
      .eq("parent_job_id", parent_job_id)
      .order("chunk_index", { ascending: true });
    if (error) throw error;

    const all = chunks ?? [];
    const done = all.filter((c) => c.status === "done").length;
    const total = all.length;
    if (total === 0 || done < total) {
      return new Response(JSON.stringify({ ready: false, done, total }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const merged = {
      pages: all.flatMap((c) => (c.payload as any)?.pages ?? []),
      ocr_text: all.map((c) => (c.payload as any)?.ocr_text ?? "").join("\n\n"),
      chunks: all.length,
      chunk_ids: all.map((c) => c.id),
    };
    await supabase.rpc("complete_processing_job", { p_job_id: parent_job_id, p_payload: merged });
    return new Response(JSON.stringify({ ready: true, merged_chunks: total }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
