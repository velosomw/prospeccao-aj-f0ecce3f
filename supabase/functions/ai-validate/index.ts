// AI Validate — Validação humana (ground truth) + Learning Loop
// Endpoints:
//   POST  /ai-validate                       → submete correção: { extraction_id?, classe, input_text, output_correto, ... }
//                                              salva em dataset_validated, gera embedding e insere em prompt_examples (ativo)
//   GET   /ai-validate?pending=1&limit=20    → lista extrações com confiança baixa para revisão
//   GET   /ai-validate?quality=1             → quality score consolidado (precisão, erros, melhoria)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { generateEmbedding } from "../_shared/vertex-embeddings.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const QUALITY_LOW_CONF = 0.75;

interface ValidateBody {
  extraction_id?: string;
  document_id?: string;
  rma_id?: string;
  company_id?: string;
  classe: string;
  agent?: string;
  path?: string;
  input_text: string;
  normalized_text?: string;
  output_original?: Record<string, unknown>;
  output_correto: Record<string, unknown>;
  corrections?: unknown[];
  notes?: string;
  source?: string;
}

// ===== Auth: extrai user id do JWT =====
async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ?? null;
  } catch {
    return null;
  }
}

// ===== Embeddings via Vertex AI (text-embedding-004 / gecko@003 — 768 dims) =====
const embedText = generateEmbedding;

// ===== DB helpers =====
async function dbInsert(table: string, row: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    console.error(`insert ${table}:`, await r.text());
    return null;
  }
  return (await r.json())?.[0];
}

async function dbSelect(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return null;
  return await r.json();
}

// ===== Handler =====
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ---- GET: pending list ou quality score ----
  if (req.method === "GET") {
    const url = new URL(req.url);

    if (url.searchParams.get("quality")) {
      const total: any[] =
        (await dbSelect(
          "ai_extractions?select=id,final_confidence,valid,status,classe&status=eq.completed&limit=10000",
        )) ?? [];
      const validated: any[] =
        (await dbSelect("dataset_validated?select=id,classe,created_at&limit=10000")) ?? [];

      const n = total.length || 1;
      const valids = total.filter((x) => x.valid === true).length;
      const errors = total.filter((x) => x.valid === false).length;
      const avgConf =
        total.reduce((a, x) => a + (Number(x.final_confidence) || 0), 0) / n;

      // Melhoria: média de confiança das últimas 100 vs primeiras 100
      const sorted = [...total].reverse();
      const last100 = sorted.slice(0, 100);
      const first100 = sorted.slice(-100);
      const avg = (arr: any[]) =>
        arr.length
          ? arr.reduce((a, x) => a + (Number(x.final_confidence) || 0), 0) / arr.length
          : 0;
      const lastAvg = avg(last100);
      const firstAvg = avg(first100);
      const melhoriaPct = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;

      const byClasse: Record<string, number> = {};
      for (const x of total) byClasse[x.classe ?? "OUTRO"] = (byClasse[x.classe ?? "OUTRO"] ?? 0) + 1;

      return new Response(
        JSON.stringify({
          total: n,
          validados_humanos: validated.length,
          precisao: Number((valids / n).toFixed(4)),
          erros: Number((errors / n).toFixed(4)),
          confianca_media: Number(avgConf.toFixed(4)),
          melhoria_pct: Number(melhoriaPct.toFixed(2)),
          por_classe: byClasse,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pending: extrações concluídas com baixa confiança ou validador=false e ainda não corrigidas
    const limit = Number(url.searchParams.get("limit") || "20");
    const list: any[] =
      (await dbSelect(
        `ai_extractions?select=id,classe,agent,path,raw_text,normalized_text,extracted_data,validation,final_confidence,valid,created_at&status=eq.completed&order=created_at.desc&limit=${limit * 3}`,
      )) ?? [];

    const validatedIds = new Set(
      ((await dbSelect("dataset_validated?select=extraction_id")) ?? [])
        .map((x: any) => x.extraction_id)
        .filter(Boolean),
    );

    const pending = list
      .filter(
        (x) =>
          !validatedIds.has(x.id) &&
          ((Number(x.final_confidence) || 0) < QUALITY_LOW_CONF || x.valid === false),
      )
      .slice(0, limit);

    return new Response(JSON.stringify({ pending, total: pending.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ---- POST: registra correção e ingere no learning loop ----
  const userId = await getUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ValidateBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.classe || !body.input_text || !body.output_correto) {
    return new Response(
      JSON.stringify({ error: "classe, input_text e output_correto são obrigatórios" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // 1. Salva ground truth
  const validated = await dbInsert("dataset_validated", {
    extraction_id: body.extraction_id ?? null,
    document_id: body.document_id ?? null,
    rma_id: body.rma_id ?? null,
    classe: body.classe,
    agent: body.agent ?? null,
    path: body.path ?? null,
    input_text: body.input_text,
    normalized_text: body.normalized_text ?? null,
    output_original: body.output_original ?? null,
    output_correto: body.output_correto,
    corrections: body.corrections ?? [],
    source: body.source ?? "human",
    validated_by: userId,
    notes: body.notes ?? null,
  });

  if (!validated?.id) {
    return new Response(JSON.stringify({ error: "Falha ao salvar ground truth" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Marca a extração original como validada (se houver)
  if (body.extraction_id) {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_extractions?id=eq.${body.extraction_id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valid: true,
        extracted_data: body.output_correto,
        corrections: body.corrections ?? [],
      }),
    }).catch((e) => console.error("patch ai_extractions:", e));
  }

  // 3. Gera embedding e ingere em prompt_examples (Learning Loop)
  const embedding = await embedText(body.normalized_text || body.input_text);
  let exampleId: string | null = null;
  if (embedding) {
    const ex = await dbInsert("prompt_examples", {
      validated_id: validated.id,
      classe: body.classe,
      agent: body.agent ?? null,
      input_text: body.input_text.slice(0, 4000),
      output_json: body.output_correto,
      embedding,
      weight: 1.0,
      active: true,
    });
    exampleId = ex?.id ?? null;
  }

  // 4. Adaptação: correção humana = sinal de erro do agente → degrada perfil (relaxa threshold, +exemplos)
  let degraded: unknown = null;
  if (body.agent) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/degrade_agent_profile_on_error`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: req.headers.get("Authorization") ?? `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_agent_name: body.agent, p_step: 0.05, p_extra_examples: 2 }),
      });
      if (r.ok) degraded = await r.json();
      else console.warn("degrade_agent_profile_on_error:", await r.text());
    } catch (e) {
      console.warn("degrade rpc error:", e);
    }
  }

  // 5. Captura automática de memória semântica + fatos por empresa
  let captured_facts = 0;
  let captured_memory = false;
  if (body.company_id) {
    // 5a) memória semântica (RAG da empresa) — usa embedding já gerado
    if (embedding) {
      const mem = await dbInsert("company_memory_embeddings", {
        company_id: body.company_id,
        rma_id: body.rma_id ?? null,
        tipo: "contexto_documento",
        conteudo: (body.normalized_text || body.input_text).slice(0, 500),
        embedding,
        weight: 1.2, // boost por ser ground truth humano
        source: "ai-validate",
        document_id: body.document_id ?? null,
        extraction_id: body.extraction_id ?? null,
        created_by: userId,
      });
      captured_memory = !!mem;
    }

    // 5b) fatos estruturados (banco, fornecedor, conta, imposto)
    const out = body.output_correto as Record<string, any>;
    const factDefs: Array<{ tipo: string; key: string }> = [
      { tipo: "banco", key: "banco" },
      { tipo: "fornecedor", key: "fornecedor" },
      { tipo: "fornecedor", key: "beneficiario" },
      { tipo: "fornecedor", key: "pagador" },
      { tipo: "conta", key: "conta" },
      { tipo: "imposto", key: "imposto" },
    ];
    for (const f of factDefs) {
      const v = out?.[f.key];
      if (typeof v === "string" && v.trim().length > 1 && v.trim().length < 200) {
        const fact = await dbInsert("company_context", {
          company_id: body.company_id,
          rma_id: body.rma_id ?? null,
          scope: f.tipo,
          chave: f.key,
          valor: v.trim(),
          weight: 1.2,
          created_by: userId,
        });
        if (fact) captured_facts++;
      }
    }
  }

  return new Response(
    JSON.stringify({
      id: validated.id,
      example_id: exampleId,
      embedded: !!embedding,
      agent_profile_degraded: degraded,
      captured_facts,
      captured_memory,
      message: "Ground truth salvo, ingerido no learning loop, perfil do agente ajustado e memória da empresa atualizada.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
