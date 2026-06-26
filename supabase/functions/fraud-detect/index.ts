// Fraud Detection — duplicidade, outliers (z-score por classe) e inconsistências intra-RMA.
// Persiste alertas em fraud_alerts e retorna a lista criada.
//
// POST /fraud-detect
//   body: { extraction_id: string }
//   → { alerts: FraudAlert[] }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const Z_SCORE_THRESHOLD = 3.0; // |z| > 3 = outlier
const MIN_SAMPLE_FOR_OUTLIER = 8;

// Campos numéricos por classe que avaliamos para outlier
const NUMERIC_FIELDS_BY_CLASSE: Record<string, string[]> = {
  PIX: ["valor"],
  COMPROVANTE: ["valor"],
  BOLETO: ["valor"],
  BALANCETE: ["ativo_total", "passivo_total", "patrimonio_liquido"],
  DRE: ["receita_liquida", "lucro_liquido"],
};

interface Alert {
  alert_type: "duplicate" | "outlier" | "inconsistency";
  severity: "low" | "medium" | "high";
  message: string;
  details: Record<string, unknown>;
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

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`RPC ${name} falhou: ${r.status} ${await r.text()}`);
  return r.json();
}

function getNum(obj: Record<string, unknown> | null, path: string): number | null {
  if (!obj) return null;
  const parts = path.split(".");
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  if (cur == null) return null;
  const n = typeof cur === "string" ? parseFloat(cur.replace(/[^\d.\-]/g, "")) : Number(cur);
  return isFinite(n) ? n : null;
}

async function detectDuplicate(extraction: any): Promise<Alert | null> {
  if (!extraction.document_id) return null;
  // Busca o sha256 do documento via pipeline_documents
  const docResp = await sb(
    `/pipeline_documents?id=eq.${extraction.document_id}&select=sha256_hash,file_name`,
  );
  if (!docResp.ok) return null;
  const docs = await docResp.json();
  const sha = docs[0]?.sha256_hash;
  if (!sha) return null;

  const dupResp = await sb(
    `/pipeline_documents?sha256_hash=eq.${sha}&id=neq.${extraction.document_id}&select=id,rma_id,file_name,created_at&limit=5`,
  );
  if (!dupResp.ok) return null;
  const dups = await dupResp.json();
  if (!dups.length) return null;

  return {
    alert_type: "duplicate",
    severity: "high",
    message: `Documento duplicado: ${dups.length} ocorrência(s) com mesmo hash sha256`,
    details: { sha256: sha, file_name: docs[0]?.file_name, duplicates: dups },
  };
}

async function detectOutliers(extraction: any): Promise<Alert[]> {
  const classe = extraction.classe;
  if (!classe || !extraction.extracted_data) return [];
  const fields = NUMERIC_FIELDS_BY_CLASSE[classe] || [];
  const alerts: Alert[] = [];

  for (const field of fields) {
    const v = getNum(extraction.extracted_data, field);
    if (v == null) continue;
    try {
      const stats = await rpc("detect_outliers_by_classe", {
        target_classe: classe,
        field_path: field,
        candidate_value: v,
      });
      const row = Array.isArray(stats) ? stats[0] : stats;
      if (!row || Number(row.sample_count) < MIN_SAMPLE_FOR_OUTLIER) continue;
      const z = Math.abs(Number(row.z_score));
      if (z > Z_SCORE_THRESHOLD) {
        alerts.push({
          alert_type: "outlier",
          severity: z > 5 ? "high" : "medium",
          message: `Valor de ${field} (${v}) está ${z.toFixed(1)}σ fora da média histórica (${Number(row.mean).toFixed(2)})`,
          details: {
            field,
            value: v,
            mean: Number(row.mean),
            stddev: Number(row.stddev),
            z_score: Number(row.z_score),
            sample_count: Number(row.sample_count),
          },
        });
      }
    } catch (e) {
      console.error(`outlier check ${field}:`, e);
    }
  }
  return alerts;
}

async function detectInconsistency(extraction: any): Promise<Alert[]> {
  if (!extraction.rma_id || extraction.classe !== "BALANCETE") return [];
  const data = extraction.extracted_data;
  if (!data) return [];
  const ativo = getNum(data, "ativo_total");
  const passivo = getNum(data, "passivo_total");
  const pl = getNum(data, "patrimonio_liquido");
  const alerts: Alert[] = [];

  if (ativo != null && passivo != null && pl != null) {
    const diff = Math.abs(ativo - (passivo + pl));
    const ref = Math.max(Math.abs(ativo), 1);
    const pct = (diff / ref) * 100;
    if (pct > 1) {
      alerts.push({
        alert_type: "inconsistency",
        severity: pct > 10 ? "high" : "medium",
        message: `Equação contábil quebrada: Ativo (${ativo}) ≠ Passivo+PL (${passivo + pl}). Diferença ${pct.toFixed(1)}%`,
        details: { ativo, passivo, patrimonio_liquido: pl, diff, diff_pct: pct },
      });
    }
  }
  return alerts;
}

async function persistAlerts(extraction: any, alerts: Alert[]) {
  if (!alerts.length) return [];
  const rows = alerts.map((a) => ({
    extraction_id: extraction.id,
    document_id: extraction.document_id,
    rma_id: extraction.rma_id,
    classe: extraction.classe,
    alert_type: a.alert_type,
    severity: a.severity,
    message: a.message,
    details: a.details,
  }));
  const r = await sb("/fraud_alerts", { method: "POST", body: JSON.stringify(rows) });
  if (!r.ok) {
    console.error("persist alerts failed:", await r.text());
    return [];
  }
  return r.json();
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
    const { extraction_id } = await req.json();
    if (!extraction_id) {
      return new Response(JSON.stringify({ error: "extraction_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exResp = await sb(`/ai_extractions?id=eq.${extraction_id}&select=*`);
    if (!exResp.ok) throw new Error(`Falha ao buscar extração: ${exResp.status}`);
    const exs = await exResp.json();
    const extraction = exs[0];
    if (!extraction) {
      return new Response(JSON.stringify({ error: "Extração não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const collected: Alert[] = [];
    const dup = await detectDuplicate(extraction);
    if (dup) collected.push(dup);
    collected.push(...(await detectOutliers(extraction)));
    collected.push(...(await detectInconsistency(extraction)));

    const persisted = await persistAlerts(extraction, collected);

    return new Response(JSON.stringify({ alerts: persisted, count: persisted.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fraud-detect error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
