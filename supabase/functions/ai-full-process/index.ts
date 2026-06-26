// AI Full Process — Pipeline unificado adaptativo
// POST /ai-full-process { document_id }
//   1. Localiza pipeline_documents + ocr_results
//   2. Se OCR ainda não rodou, dispara ocr-google-vision e aguarda
//   3. Chama ai-process (que já faz embedding + prompt builder + agente + validador)
//   4. Calcula quality_score = ocr*0.3 + ai*0.5 + validation*0.2
//   5. Aplica regras: <0.7 → reprocessa 1x com top_k maior; <0.5 ou após retry → pending_review
//   6. Roda fraud-detect
//   7. Atualiza ai_extractions com quality_score, validation_score, quality_action
//
// Resposta: { extraction_id, quality_score, quality_action, alerts_count }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { saveVersion } from "../_shared/document-versioning.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const QUALITY_RETRY_THRESHOLD = 0.7;
const QUALITY_REVIEW_THRESHOLD = 0.5;

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

async function invokeFn(name: string, body: unknown, method = "POST") {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method,
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  let json: any;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!r.ok) throw new Error(`fn ${name} ${r.status}: ${json?.error || txt}`);
  return json;
}

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 5 * 60_000) {
  const start = Date.now();
  while (true) {
    const v = await fn();
    if (ok(v)) return v;
    if (Date.now() - start > timeoutMs) throw new Error("Timeout aguardando processamento");
    await new Promise((r) => setTimeout(r, 2500));
  }
}

interface FullProcessRequest {
  document_id: string;
  /** Força reprocesso ignorando quality engine (usado internamente no auto-retry). */
  _retry?: boolean;
  _previous_extraction_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { document_id, _retry, _previous_extraction_id } = (await req.json()) as FullProcessRequest;
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Documento
    const docResp = await sb(
      `/pipeline_documents?id=eq.${document_id}&select=id,rma_id,file_name,storage_path,mime_type,external_id`,
    );
    const docs = await docResp.json();
    const doc = docs[0];
    if (!doc) {
      return new Response(JSON.stringify({ error: "Documento não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trackerResp = doc.external_id
      ? await sb(`/onedrive_files?file_id=eq.${encodeURIComponent(doc.external_id)}&select=path,file_name&limit=1`)
      : null;
    const tracker = trackerResp ? (await trackerResp.json())?.[0] : null;
    const effectivePath = doc.storage_path || tracker?.path || doc.file_name || document_id;

    // 2) OCR result (assume que já existe; se não, frontend dispara separadamente)
    const ocrResp = await sb(
      `/ocr_results?document_id=eq.${document_id}&order=created_at.desc&limit=1&select=*`,
    );
    const ocrs = await ocrResp.json();
    let ocr = ocrs[0];

    if (!ocr || ocr.status !== "completed" || !ocr.raw_text) {
      // Aguarda OCR completar (caso esteja em processamento)
      if (ocr && (ocr.status === "pending" || ocr.status === "processing")) {
        ocr = await waitFor(
          async () => {
            const r = await sb(`/ocr_results?id=eq.${ocr.id}&select=*`);
            return (await r.json())[0];
          },
          (v: any) => v && (v.status === "completed" || v.status === "failed"),
        );
      }
      if (!ocr || ocr.status !== "completed" || !ocr.raw_text) {
        return new Response(
          JSON.stringify({ error: "OCR ainda não disponível para este documento" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Snapshot estágio OCR
    await saveVersion({
      document_id,
      stage: "ocr",
      data: {
        raw_text: ocr.raw_text?.slice(0, 100_000),
        normalized_text: ocr.normalized_text?.slice(0, 100_000),
        confidence: ocr.confidence,
        engine: ocr.engine,
      },
      confidence: ocr.confidence ?? null,
      rma_id: doc.rma_id,
      status: "ok",
    }).catch((e) => console.error("saveVersion ocr failed:", e));

    // 3) Chama ai-process (que internamente faz: embedding → prompt builder → agente → validador)
    const text = ocr.normalized_text || ocr.raw_text;
    const layoutHint = (() => {
      const head = text.slice(0, 12_000).toLowerCase();
      const p = String(effectivePath || "").toLowerCase();
      const hasBalanceCols = /saldo\s+anterior/.test(head) && /d[eé]bito|debito/.test(head) && /cr[eé]dito|credito/.test(head) && /saldo\s+(atual|final)/.test(head);
      const isBalancetePath = /balancete|balan[cç]o|raz[aã]o|cont[áa]bil|contabil/.test(p);
      if (hasBalanceCols && ocr.engine === "xlsx-direct") return "agrosys";
      if (hasBalanceCols && /\s[dc]\s*(\n|;|\||$)/i.test(head)) return "nardelli";
      if (hasBalanceCols || (isBalancetePath && /balancete|balan[cç]o\s+patrimonial/.test(head))) return "balancete_sheet";
      return null;
    })();
    const aiInput: Record<string, unknown> = {
      document_id,
      rma_id: doc.rma_id,
      text,
      normalized_text: ocr.normalized_text,
      path: effectivePath,
      ocr_confidence: ocr.confidence ?? undefined,
      source_engine: ocr.engine,
      ...(layoutHint ? { layout_hint: layoutHint } : {}),
      async: true,
    };
    if (_retry && _previous_extraction_id) {
      aiInput.resume_from_id = _previous_extraction_id;
    }

    const startResp = await invokeFn("ai-process", aiInput);

    let extractionId: string;
    if (startResp.status === "pending" && startResp.id) {
      // assíncrono: não aguarda aqui para evitar idle timeout de Edge Function.
      // O ai-process continua em background e o balancete-build consome a extração
      // quando ela chegar em status=completed.
      extractionId = startResp.id;
      return new Response(
        JSON.stringify({
          extraction_id: extractionId,
          status: "pending",
          quality_action: "processing_async",
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else if (startResp.id) {
      extractionId = startResp.id;
    } else {
      // resultado síncrono completo — buscar registro persistido
      const ex = await sb(
        `/ai_extractions?document_id=eq.${document_id}&order=created_at.desc&limit=1&select=id`,
      );
      const list = await ex.json();
      extractionId = list[0]?.id;
      if (!extractionId) throw new Error("Não foi possível identificar a extração criada");
    }

    // 4) Carrega extração final
    const exResp = await sb(`/ai_extractions?id=eq.${extractionId}&select=*`);
    const extraction = (await exResp.json())[0];
    if (!extraction) throw new Error("Extração não encontrada após processamento");

    // 5) Quality engine
    const ocrScore = Number(extraction.ocr_confidence ?? 0);
    const aiScore = Number(extraction.ai_confidence ?? 0);
    const validationScore = Number(extraction.validation?.confianca ?? (extraction.valid ? 0.9 : 0.4));
    const qualityScore = ocrScore * 0.3 + aiScore * 0.5 + validationScore * 0.2;

    let qualityAction = "ok";
    const previousRetry = Number(extraction.auto_retry_count ?? 0);

    if (qualityScore < QUALITY_REVIEW_THRESHOLD) {
      qualityAction = "pending_review";
    } else if (qualityScore < QUALITY_RETRY_THRESHOLD && previousRetry === 0 && !_retry) {
      qualityAction = "reprocessed";
    }

    await sb(`/ai_extractions?id=eq.${extractionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        validation_score: validationScore,
        quality_score: qualityScore,
        quality_action: qualityAction,
      }),
    });

    // Snapshots de estágio: extracted (dados crus do agente) + validated (após validador)
    await saveVersion({
      document_id,
      stage: "extracted",
      classe: extraction.classe,
      agent: extraction.agent,
      confidence: aiScore,
      rma_id: doc.rma_id,
      extracted_data: extraction.extracted_data,
      data: { extracted_data: extraction.extracted_data, ai_confidence: aiScore },
      status: "ok",
    }).catch((e) => console.error("saveVersion extracted failed:", e));

    await saveVersion({
      document_id,
      stage: "validated",
      classe: extraction.classe,
      agent: extraction.agent,
      confidence: validationScore,
      rma_id: doc.rma_id,
      extracted_data: extraction.extracted_data,
      data: {
        validation: extraction.validation,
        valid: extraction.valid,
        quality_score: qualityScore,
        quality_action: qualityAction,
      },
      status: qualityAction === "ok" ? "ok" : "review",
    }).catch((e) => console.error("saveVersion validated failed:", e));

    let alertsCount = 0;
    try {
      const fr = await invokeFn("fraud-detect", { extraction_id: extractionId });
      alertsCount = fr?.count ?? 0;
    } catch (e) {
      console.error("fraud-detect failed:", e);
    }

    // 7) Auto-retry se necessário (1x apenas)
    if (qualityAction === "reprocessed" && !_retry) {
      // marca contador e dispara novo full-process
      await sb(`/ai_extractions?id=eq.${extractionId}`, {
        method: "PATCH",
        body: JSON.stringify({ auto_retry_count: previousRetry + 1 }),
      });
      try {
        const retryResult = await invokeFn("ai-full-process", {
          document_id,
          _retry: true,
          _previous_extraction_id: extractionId,
        });
        return new Response(
          JSON.stringify({
            extraction_id: retryResult.extraction_id || extractionId,
            quality_score: retryResult.quality_score,
            quality_action: retryResult.quality_action,
            alerts_count: alertsCount + (retryResult.alerts_count || 0),
            retried: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (e) {
        console.error("auto-retry failed:", e);
        // mantém resultado original com flag pending_review
        await sb(`/ai_extractions?id=eq.${extractionId}`, {
          method: "PATCH",
          body: JSON.stringify({ quality_action: "pending_review" }),
        });
        qualityAction = "pending_review";
      }
    }

    return new Response(
      JSON.stringify({
        extraction_id: extractionId,
        quality_score: qualityScore,
        validation_score: validationScore,
        ocr_score: ocrScore,
        ai_score: aiScore,
        quality_action: qualityAction,
        alerts_count: alertsCount,
        retried: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-full-process error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
