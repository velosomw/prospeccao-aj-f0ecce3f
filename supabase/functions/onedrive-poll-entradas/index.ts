// Polls /Projeto RMA/{CLIENTE}/{ANO}/{PERIODO}/ENTRADAS, validates each file,
// registers it in pipeline_documents and moves it to /PROCESSANDO.
// Invalid files go to /ERROS. All operations are audited.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  resolveShareLink,
  listChildren,
  ensureFolder,
  ensureOperationalSubfolders,
  validateFile,
  moveItem,
  audit,
  getServiceClient,
  ONEDRIVE_CONFIG,
  assertWithinBase,
} from "../_shared/onedrive.ts";
import { graphErrorHttpStatus, toGraphErrorPayload } from "../_shared/graph-errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Dispara ai-full-process em background (não bloqueia o poll)
function triggerFullProcess(documentId: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  fetch(`${url}/functions/v1/ai-full-process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ document_id: documentId }),
  }).catch((e) => console.error("triggerFullProcess failed", documentId, e));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const {
      rmaId = "RMA-001",
      shareUrl = "https://bexonedrive-my.sharepoint.com/:f:/g/personal/tecnico_brasilexpert_com_br/IgA6tcBZSKW9Qq9kqTMlHODwAWn9lmWTkQNwh_kj1yOvzxA",
      clientFolder,
      year = new Date().getFullYear().toString(),
      period,
    } = body;

    if (!period) throw new Error("period is required (ex: '03.2026')");

    const root = await resolveShareLink(shareUrl);
    if (!root.driveId || !root.itemId) throw new Error("Falha ao resolver share link");

    let cursor = root.itemId;
    let path = ONEDRIVE_CONFIG.base_path;

    if (clientFolder) {
      const k = await listChildren(root.driveId, cursor);
      const node = k.find((c: any) => c.name === clientFolder && c.folder);
      if (!node) throw new Error(`Cliente '${clientFolder}' não encontrado`);
      cursor = node.id; path += `/${clientFolder}`;
    }

    const yearNode = await ensureFolder(root.driveId, cursor, year);
    cursor = yearNode.id; path += `/${year}`;
    const periodNode = await ensureFolder(root.driveId, cursor, period);
    cursor = periodNode.id; path += `/${period}`;
    assertWithinBase(path);

    const op = await ensureOperationalSubfolders(root.driveId, cursor);

    const entradas = await listChildren(root.driveId, op.ENTRADAS);
    const files = entradas.filter((it: any) => it.file);

    const supabase = getServiceClient();
    const results: any[] = [];

    for (const f of files) {
      try {
        validateFile(f.name, f.size || 0);

        const { data: existing } = await supabase
          .from("pipeline_documents")
          .select("id")
          .eq("rma_id", rmaId)
          .eq("external_id", f.id)
          .maybeSingle();

        let docId = existing?.id;
        let isNew = false;
        if (!docId) {
          const { data, error } = await supabase.from("pipeline_documents").insert({
            rma_id: rmaId,
            file_name: f.name,
            mime_type: f.file?.mimeType || "application/octet-stream",
            file_size: f.size || 0,
            sha256_hash: `onedrive:${f.id}`,
            provider: "onedrive",
            external_id: f.id,
            pipeline_status: "queued",
            pipeline_step: 1,
          }).select("id").single();
          if (error) throw new Error(`DB insert: ${error.message}`);
          docId = data!.id;
          isNew = true;
        }

        await moveItem(root.driveId, f.id, op.PROCESSANDO);
        // Dispara pipeline adaptativo (OCR → IA → validação → antifraude) em background
        if (isNew && docId) triggerFullProcess(docId);
        await audit({ documentId: docId, step: "onedrive_poll_move", status: "success",
          details: { from: "ENTRADAS", to: "PROCESSANDO", file: f.name } });
        results.push({ file: f.name, status: "moved_to_processando", docId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try { await moveItem(root.driveId, f.id, op.ERROS); } catch { /* ignore */ }
        await audit({ documentId: null, step: "onedrive_poll_invalid", status: "error",
          errorMessage: msg, details: { file: f.name } });
        results.push({ file: f.name, status: "moved_to_erros", error: msg });
      }
    }

    await audit({
      documentId: null, step: "onedrive_poll_entradas", status: "success",
      durationMs: Date.now() - startedAt,
      details: { rmaId, path, processed: results.length },
    });

    return new Response(JSON.stringify({
      success: true, rmaId, path, processed: results.length, results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const payload = toGraphErrorPayload(e);
    await audit({
      documentId: null, step: "onedrive_poll_entradas", status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: payload.error,
      details: {
        category: payload.category,
        graphStatus: payload.graphStatus,
        endpoint: payload.endpoint,
      },
    });
    return new Response(JSON.stringify(payload), { status: graphErrorHttpStatus(payload), headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
