// learning-from-pipeline — pega 1 arquivo do OneDrive (file_id), baixa via Graph,
// sobe no bucket "learning-docs", dispara OCR + ai-process e marca a extração
// como source='learning', para validação humana posterior em /gestor-ia/aprendizado.
//
// POST { file_id, rma_id?, document_id? }
// Resposta: { ok, learning_path, public_url, ocr: {...}, extraction_id }

import { graphApp, getAppCreds } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "learning-docs";

function detectBalanceteLayout(text: string, path?: string): "agrosys" | "nardelli" | "balancete_sheet" | null {
  const head = text.slice(0, 12_000).toLowerCase();
  const p = (path || "").toLowerCase();
  const hasBalanceCols = /saldo\s+anterior/.test(head) && /d[eé]bito|debito/.test(head) && /cr[eé]dito|credito/.test(head) && /saldo\s+(atual|final)/.test(head);
  const isBalancetePath = /balancete|balan[cç]o|raz[aã]o|cont[áa]bil|contabil/.test(p);
  if (hasBalanceCols && /### sheet:/i.test(text)) return "agrosys";
  if (hasBalanceCols && /\s[dc]\s*(\n|;|\||$)/i.test(head)) return "nardelli";
  if (hasBalanceCols || (isBalancetePath && /balancete|balan[cç]o\s+patrimonial/.test(head))) return "balancete_sheet";
  return null;
}

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}

async function invokeFn(name: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j: any; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`${name} ${r.status}: ${(j?.error || t).toString().slice(0, 300)}`);
  return j;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { file_id, rma_id, document_id } = await req.json();
    if (!file_id) {
      return new Response(JSON.stringify({ error: "file_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Resolve metadados do arquivo no tracker
    const trkResp = await sb(`/onedrive_files?file_id=eq.${file_id}&select=*&limit=1`);
    const trk = (await trkResp.json())[0];
    if (!trk) throw new Error(`onedrive_files row não encontrada para file_id=${file_id}`);

    const driveId = trk.drive_id;
    if (!driveId) throw new Error("drive_id ausente no tracker");
    const fileName: string = trk.file_name || file_id;
    const mimeType: string = trk.mime_type || "application/octet-stream";
    const sourcePath = trk.path || fileName;

    // 2) Baixa conteúdo do OneDrive (Graph application token)
    const { userUpn } = getAppCreds();
    // tenta drives/{driveId}/items/{itemId}/content; fallback users/{upn}/drive/items/{itemId}/content
    const contentUrls = [
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${file_id}/content`,
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userUpn)}/drive/items/${file_id}/content`,
    ];
    // Reaproveita graphApp só para token; baixa com fetch direto pra obter binário
    const tokenResp = await graphApp<any>(`users/${encodeURIComponent(userUpn)}/drive/root`); // valida token
    void tokenResp;
    // pega token diretamente do cache via reuse: chamada simples retorna json — para binário usamos fetch crua
    const azure = (await import("../_shared/graph-app.ts")) as any;
    const accessToken = await azure.getAppToken();

    let bytes: Uint8Array | null = null;
    let lastErr = "";
    for (const u of contentUrls) {
      const r = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: "follow" });
      if (r.ok) {
        bytes = new Uint8Array(await r.arrayBuffer());
        break;
      }
      lastErr = `${r.status} ${r.statusText}`;
    }
    if (!bytes) throw new Error(`Falha ao baixar arquivo do OneDrive: ${lastErr}`);

    // 3) Upload para bucket learning-docs
    const safe = fileName.replace(/[^\w.\-]+/g, "_");
    const learningPath = `${new Date().getFullYear()}/${crypto.randomUUID()}_${safe}`;
    const upResp = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${learningPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          "Content-Type": mimeType,
          "x-upsert": "false",
        },
        body: bytes,
      },
    );
    if (!upResp.ok) {
      throw new Error(`Upload bucket falhou: ${upResp.status} ${await upResp.text()}`);
    }
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${learningPath}`;

    // 4) Dispara OCR (sync se possível, ou async)
    let ocrInfo: any = { skipped: true };
    let ocrText = "";
    let ocrConf: number | null = null;

    const isText = mimeType.startsWith("text/") || /\.(txt|csv|log)$/i.test(fileName);
    const isSheet = /spreadsheet|excel/i.test(mimeType) || /\.(xlsx|xls|xlsm)$/i.test(fileName);

    if (isText) {
      ocrText = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");
      ocrConf = 1;
      ocrInfo = { engine: "client_text", ok: true };
    } else if (isSheet) {
      // Parse XLSX/XLS/XLSM com SheetJS — converte cada aba para CSV e concatena.
      // Dedup: remove linhas duplicadas dentro de cada aba (hash do conteúdo normalizado).
      try {
        const XLSX = await import("npm:xlsx@0.18.5");
        const wb = XLSX.read(bytes, { type: "array", cellDates: true });
        const parts: string[] = [];
        let totalRows = 0;
        let totalDedup = 0;
        const normRow = (s: string) =>
          s.replace(/\s+/g, " ").replace(/[;,]+$/g, "").trim().toLowerCase();
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          if (!ws) continue;
          const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";", blankrows: false });
          if (!csv.trim()) continue;
          const lines = csv.split("\n");
          const seen = new Set<string>();
          const out: string[] = [];
          for (const ln of lines) {
            const key = normRow(ln);
            if (!key) continue;
            if (seen.has(key)) { totalDedup++; continue; }
            seen.add(key);
            out.push(ln);
          }
          const dedupCsv = out.join("\n");
          totalRows += out.length;
          parts.push(`### Sheet: ${name} (${out.length} linhas, ${lines.length - out.length} dup removidas)\n${dedupCsv}`);
        }
        let combined = parts.join("\n\n");
        const MAX = 2 * 1024 * 1024; // 2MB
        if (combined.length > MAX) combined = combined.slice(0, MAX) + "\n[TRUNCATED]";
        ocrText = combined;
        ocrConf = 0.95;
        ocrInfo = { engine: "sheetjs", ok: true, sheets: wb.SheetNames.length, rows: totalRows, dedup_removed: totalDedup, bytes: combined.length };
      } catch (e) {
        ocrInfo = { engine: "sheetjs", ok: false, error: (e as Error).message };
      }
    } else {
      // PDF / imagem → google vision
      const ocr = await invokeFn("ocr-google-vision", {
        fileUrl: publicUrl,
        mimeType,
        persist: true,
      });
      ocrInfo = { engine: "google_vision", mode: ocr.mode, resultId: ocr.resultId };
      if (ocr.mode === "sync") {
        ocrText = ocr.text || ocr.rawText || "";
        ocrConf = ocr.confidence ?? null;
      }
    }

    // 5) Se já temos texto sync, dispara ai-process e marca learning
    let extractionId: string | null = null;
    if (ocrText && ocrText.length > 20) {
      try {
        const ai = await invokeFn("ai-process", {
          text: ocrText,
          normalized_text: ocrText,
          path: sourcePath,
          ocr_confidence: ocrConf,
          source_engine: ocrInfo.engine,
          layout_hint: detectBalanceteLayout(ocrText, sourcePath),
          async: true,
        });
        extractionId = ai.id || null;
      } catch (e) {
        ocrInfo.ai_error = (e as Error).message;
      }
    }

    if (extractionId) {
      // marca como learning + guarda referência
      await sb(`/ai_extractions?id=eq.${extractionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          source: "learning",
          partial_results: {
            learning_file: {
              bucket: BUCKET,
              path: learningPath,
              mime_type: mimeType,
              file_name: fileName,
              source_file_id: file_id,
              source_rma_id: rma_id ?? trk.rma_id ?? null,
              source_document_id: document_id ?? null,
            },
          },
        }),
      });
    }

    // Sucesso: marca tracker e cancela qualquer job pendente para esse arquivo
    await sb(`/onedrive_files?file_id=eq.${file_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        last_learning_at: new Date().toISOString(),
        last_learning_error: null,
        requires_manual_upload: false,
        learning_attempts: (trk.learning_attempts ?? 0) + 1,
      }),
    });
    await sb(`/processing_queue?file_id=eq.${file_id}&status=in.(pending,processing)`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "cancelled",
        block_reason: "moved_to_learning",
        lock_until: null,
        locked_by: null,
      }),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        file_id,
        learning_path: learningPath,
        public_url: publicUrl,
        mime_type: mimeType,
        ocr: ocrInfo,
        extraction_id: extractionId,
        next: "Abra /gestor-ia/aprendizado para validar este documento.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("learning-from-pipeline error", e);
    const msg = e instanceof Error ? e.message : String(e);

    // Falhou: marca como "precisa upload manual" e tira da fila
    try {
      const body = await req.clone().json().catch(() => ({} as any));
      const fid = (body as any)?.file_id;
      if (fid) {
        await sb(`/onedrive_files?file_id=eq.${fid}`, {
          method: "PATCH",
          body: JSON.stringify({
            requires_manual_upload: true,
            last_learning_error: msg.slice(0, 500),
            last_learning_at: new Date().toISOString(),
            status: "manual_upload_required",
          }),
        });
        await sb(`/processing_queue?file_id=eq.${fid}&status=in.(pending,processing,failed)`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "cancelled",
            block_reason: "learning_failed_manual_required",
            lock_until: null,
            locked_by: null,
          }),
        });
      }
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ ok: false, error: msg, requires_manual_upload: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
