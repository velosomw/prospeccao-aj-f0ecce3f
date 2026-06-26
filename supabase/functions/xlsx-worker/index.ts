// xlsx-worker — Leitor de XLSX via Microsoft Graph Excel API (sem parser local).
//
// Por que Graph e não baixar o arquivo?
//   O parser `xlsx` em JS materializa o workbook inteiro em memória e estoura o
//   limite do edge-runtime (~256 MB) mesmo para XLSX de 4-32 MB. A Excel API do
//   Graph devolve apenas os VALORES já calculados, em páginas — sem precisar
//   baixar/descompactar/parsear o .xlsx.
//
// Estratégia:
//   1) Lista worksheets do workbook (drives/{driveId}/items/{itemId}/workbook/worksheets).
//   2) Para cada sheet: lê usedRange com $select=address,rowCount,columnCount.
//   3) Pagina os valores em janelas de N linhas via range(address='A{i}:{col}{j}')
//      ?$select=values  — concatena em TSV com cap global.
//   4) Para arquivos CSV (não-XLSX) cai para download streaming via downloadUrl.
//
// POST { file_id, company_id?, rma_id?, folder_path?, file_name, document_id?, payload? }
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { graphApp, getAppCreds } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const RAW_TEXT_CAP_BYTES = 8 * 1024 * 1024; // 8 MB cap no raw_text final
const PAGE_ROWS = 8000;                      // janela maior → menos round-trips Graph
const MAX_ROWS_PER_SHEET = 200_000;          // hard cap para sheets absurdas
const MAX_COLS = 200;                        // hard cap colunas

/** Converte índice de coluna 1-based para letra Excel (1→A, 27→AA). */
function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Resolve drive_id do arquivo (cai para o drive do UPN se ausente). */
async function resolveDrive(fileId: string, driveId?: string | null): Promise<string> {
  if (driveId) return driveId;
  const { userUpn } = getAppCreds();
  const meta = await graphApp<{ parentReference?: { driveId?: string } }>(
    `users/${encodeURIComponent(userUpn)}/drive/items/${fileId}?select=id,parentReference`,
  );
  const d = meta.parentReference?.driveId;
  if (!d) throw new Error("drive_id não resolvido para o arquivo");
  return d;
}

/** Para CSV: baixa direto streaming (não precisa do Excel API). */
async function streamDownloadCsv(fileId: string, driveId: string): Promise<string> {
  const meta = await graphApp<{ "@microsoft.graph.downloadUrl"?: string }>(
    `drives/${driveId}/items/${fileId}?select=id,@microsoft.graph.downloadUrl`,
  );
  const url = meta["@microsoft.graph.downloadUrl"];
  if (!url) throw new Error("CSV sem downloadUrl");
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`CSV download ${r.status}`);
  const dec = new TextDecoder("utf-8");
  const reader = r.body.getReader();
  let out = ""; let used = 0; let capped = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = dec.decode(value, { stream: true });
    const remaining = RAW_TEXT_CAP_BYTES - used;
    if (remaining <= 0) { capped = true; break; }
    if (chunk.length > remaining) { out += chunk.slice(0, remaining); used += remaining; capped = true; break; }
    out += chunk; used += chunk.length;
  }
  return capped ? out + "\n[TRUNCATED]" : out;
}

// Núcleo do processamento — roda em background via EdgeRuntime.waitUntil para
// evitar idle timeout em arquivos com muitas páginas no Graph.
async function processFile(args: {
  file_id: string; rma_id?: string | null; company_id?: string | null;
  file_name?: string | null; document_id?: string | null;
}) {
  const { file_id, rma_id, file_name, document_id } = args;
  try {
    const { data: of } = await supabase
      .from("onedrive_files")
      .select("drive_id, file_name, mime_type, size_bytes")
      .eq("file_id", file_id).maybeSingle();

    const name = file_name || of?.file_name || "";
    const isCsv = /\.csv$/i.test(name) || (of?.mime_type || "").toLowerCase().includes("csv");
    const driveId = await resolveDrive(file_id, of?.drive_id);

    let raw = "";
    let sheetSummary: { sheet: string; rows: number; cols: number; bytes: number; truncated?: boolean }[] = [];
    let totalRows = 0;
    let capped = false;

    if (isCsv) {
      console.log(`[xlsx-worker] CSV stream ${name}`);
      raw = await streamDownloadCsv(file_id, driveId);
      totalRows = (raw.match(/\n/g) || []).length;
      sheetSummary = [{ sheet: "csv", rows: totalRows, cols: 0, bytes: raw.length }];
      capped = raw.endsWith("[TRUNCATED]");
    } else {
      console.log(`[xlsx-worker] Graph Excel API ${name} (~${of?.size_bytes ?? "?"} bytes)`);
      const wsList = await graphApp<{ value: { id: string; name: string }[] }>(
        `drives/${driveId}/items/${file_id}/workbook/worksheets?$select=id,name`,
      );

      const parts: string[] = [];
      let usedBytes = 0;

      for (const sheet of wsList.value || []) {
        if (capped) { sheetSummary.push({ sheet: sheet.name, rows: 0, cols: 0, bytes: 0, truncated: true }); continue; }

        const usedRange = await graphApp<{ address?: string; rowCount?: number; columnCount?: number }>(
          `drives/${driveId}/items/${file_id}/workbook/worksheets/${encodeURIComponent(sheet.id)}/usedRange(valuesOnly=true)?$select=address,rowCount,columnCount`,
        ).catch((e) => { console.warn(`[xlsx-worker] usedRange falhou em ${sheet.name}: ${e}`); return {}; });

        const rowCount = Math.min(usedRange.rowCount ?? 0, MAX_ROWS_PER_SHEET);
        const colCount = Math.min(usedRange.columnCount ?? 0, MAX_COLS);
        if (rowCount === 0 || colCount === 0) {
          sheetSummary.push({ sheet: sheet.name, rows: 0, cols: 0, bytes: 0 });
          continue;
        }

        const header = `\n===== SHEET: ${sheet.name} =====\n`;
        parts.push(header); usedBytes += header.length;
        let sheetBytes = 0; let sheetTruncated = false; let processedRows = 0;
        const lastCol = colLetter(colCount);

        for (let r0 = 1; r0 <= rowCount && !capped; r0 += PAGE_ROWS) {
          const r1 = Math.min(r0 + PAGE_ROWS - 1, rowCount);
          const addr = `A${r0}:${lastCol}${r1}`;
          let page: { values?: unknown[][] } = {};
          try {
            page = await graphApp<{ values?: unknown[][] }>(
              `drives/${driveId}/items/${file_id}/workbook/worksheets/${encodeURIComponent(sheet.id)}/range(address='${addr}')?$select=values`,
            );
          } catch (e) {
            console.warn(`[xlsx-worker] page falhou ${sheet.name} ${addr}: ${e}`);
            sheetTruncated = true; break;
          }
          const rows = page.values || [];
          let pageTsv = "";
          for (const row of rows) {
            const line = row.map((v) => (v == null ? "" : String(v).replace(/[\t\n\r]/g, " "))).join("\t") + "\n";
            pageTsv += line;
          }
          const remaining = RAW_TEXT_CAP_BYTES - usedBytes;
          if (pageTsv.length > remaining) {
            parts.push(pageTsv.slice(0, remaining));
            usedBytes += remaining; sheetBytes += remaining;
            capped = true; sheetTruncated = true;
            processedRows += Math.max(1, Math.floor(rows.length * (remaining / pageTsv.length)));
            break;
          }
          parts.push(pageTsv);
          usedBytes += pageTsv.length; sheetBytes += pageTsv.length;
          processedRows += rows.length;
        }

        totalRows += processedRows;
        sheetSummary.push({
          sheet: sheet.name, rows: processedRows, cols: colCount,
          bytes: sheetBytes, truncated: sheetTruncated || undefined,
        });
      }

      raw = parts.join("");
    }

    // Resolve document_id via pipeline_documents (necessário para ocr_results + ai-full-process)
    let docId = document_id as string | null;
    if (!docId) {
      let q = supabase.from("pipeline_documents").select("id, rma_id")
        .eq("external_id", file_id)
        .order("created_at", { ascending: false }).limit(1);
      if (rma_id) q = q.eq("rma_id", rma_id);
      const { data: pd } = await q.maybeSingle();
      docId = pd?.id ?? null;
    }

    // Schema real do ocr_results: document_id, engine, raw_text, structure (jsonb),
    // confidence, page_count, status. Sem file_id/company_id/provider/metadata.
    if (docId) {
      const { error: ocrErr } = await supabase.from("ocr_results").insert({
        document_id: docId,
        rma_id: rma_id ?? null,
        engine: isCsv ? "csv_stream" : "graph_excel_api",
        raw_text: raw,
        page_count: sheetSummary.length,
        pages_total: sheetSummary.length,
        pages_processed: sheetSummary.length,
        confidence: 1.0,
        status: "completed",
        structure: {
          sheets: sheetSummary, total_rows: totalRows, file_name: name,
          source_size_bytes: of?.size_bytes ?? null,
          raw_text_cap_bytes: RAW_TEXT_CAP_BYTES, raw_text_capped: capped,
        },
      });
      if (ocrErr) console.error(`[xlsx-worker] insert ocr_results falhou: ${ocrErr.message}`);
    } else {
      console.warn(`[xlsx-worker] sem pipeline_documents.id para ${file_id} — pulando ocr_results`);
    }

    const { error: ofErr } = await supabase.from("onedrive_files")
      .update({ status: "processed", last_processed_at: new Date().toISOString(), error_message: null })
      .eq("file_id", file_id);
    if (ofErr) console.error(`[xlsx-worker] update onedrive_files falhou: ${ofErr.message}`);

    if (docId) {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/ai-full-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}`, apikey: SERVICE_ROLE },
        body: JSON.stringify({ document_id: docId, _from_xlsx: true }),
      }).catch((e) => { console.warn(`[xlsx-worker] ai-full-process invoke falhou: ${e}`); return null; });
      console.log(`[xlsx-worker] ${name} done: sheets=${sheetSummary.length} rows=${totalRows} bytes=${raw.length} capped=${capped} ai=${(r as any)?.status ?? "n/a"}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[xlsx-worker] processFile ${file_id} falhou: ${msg}`);
    await supabase.from("onedrive_files")
      .update({ status: "error", error_message: msg.slice(0, 1000) })
      .eq("file_id", file_id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { file_id, company_id, rma_id, file_name, document_id } = body;
    if (!file_id) throw new Error("file_id obrigatório");

    // Marca em processamento imediatamente — evita re-fire pelo cron.
    await supabase.from("onedrive_files")
      .update({ status: "processing", error_message: null })
      .eq("file_id", file_id);

    // Background: libera a resposta para não estourar idle timeout (150s).
    const task = processFile({ file_id, company_id, rma_id, file_name, document_id });
    // @ts-ignore EdgeRuntime global
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(task);
    } else {
      // fallback dev — não bloqueia
      task.catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true, mode: "background", file_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[xlsx-worker]", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

