// sped-worker — Lê SPED/.txt do OneDrive e extrai estrutura básica
// para ocr_results + ai-full-process.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { graphApp, getAppCreds } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function dl(fileId: string, driveId?: string | null): Promise<Uint8Array> {
  const select = "id,name,file,@microsoft.graph.downloadUrl";
  const tries: string[] = [];
  if (driveId) tries.push(`drives/${driveId}/items/${fileId}?select=${select}`);
  const { userUpn } = getAppCreds();
  tries.push(`users/${encodeURIComponent(userUpn)}/drive/items/${fileId}?select=${select}`);
  let lastErr: unknown = null;
  for (const p of tries) {
    try {
      const meta = await graphApp<{ "@microsoft.graph.downloadUrl"?: string }>(p);
      const u = meta["@microsoft.graph.downloadUrl"]; if (!u) throw new Error("sem downloadUrl");
      const r = await fetch(u); if (!r.ok) throw new Error(`download ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Parser leve do SPED: agrupa por bloco (primeiro registro de cada linha)
function summarizeSped(raw: string) {
  const byReg: Record<string, number> = {};
  let totalLines = 0;
  const sample: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const reg = line.split("|", 3)[1] || "?";
    byReg[reg] = (byReg[reg] || 0) + 1;
    if (!sample[reg]) sample[reg] = line.slice(0, 240);
    totalLines++;
  }
  return { totalLines, registros: byReg, samples: sample };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { file_id, company_id, rma_id, file_name, document_id, payload } = body;
    if (!file_id) throw new Error("file_id obrigatório");

    const { data: of } = await supabase
      .from("onedrive_files")
      .select("drive_id, file_name")
      .eq("file_id", file_id).maybeSingle();

    const bytes = await dl(file_id, of?.drive_id);
    if (bytes.length === 0) {
      await supabase.rpc("mark_file_manual_upload_required", {
        p_file_id: file_id, p_reason: "SPED 0 bytes (corrompido na origem)",
      });
      return new Response(JSON.stringify({ ok: false, error: "0 bytes", marked_manual: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SPED é Latin1 normalmente
    const raw = new TextDecoder("latin1").decode(bytes);
    const summary = summarizeSped(raw);

    await supabase.from("ocr_results").upsert({
      file_id, company_id, rma_id,
      raw_text: raw.slice(0, 5_000_000), // cap defensivo
      page_count: 1,
      provider: "sped_parser", status: "completed",
      metadata: { ...summary, file_name },
    }, { onConflict: "file_id" });

    await supabase.from("onedrive_files")
      .update({ status: "processed", last_processed_at: new Date().toISOString(), error_message: null })
      .eq("file_id", file_id);

    fetch(`${SUPABASE_URL}/functions/v1/ai-full-process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
      body: JSON.stringify({ file_id, document_id, company_id, rma_id, ...(payload || {}), _from_sped: true }),
    }).catch((e) => console.warn("[sped-worker] ai-full-process invoke fail", e));

    return new Response(JSON.stringify({ ok: true, ...summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sped-worker]", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
