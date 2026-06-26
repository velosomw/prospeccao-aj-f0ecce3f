// Salva um exemplo validado pelo usuário em 3 destinos:
//   1) dataset_validated  → ground truth permanente
//   2) prompt_examples    → few-shot (com embedding 768d)
//   3) agent_profiles     → atualiza quality_score / validation_count
//
// POST body: {
//   classe: string,
//   agent?: string,
//   input_text: string,           // texto OCR/normalizado do doc
//   output_correto: any,          // JSON corrigido pelo usuário
//   output_original?: any,        // o que a IA tinha entregado
//   extraction_id?: string,
//   document_id?: string,
//   rma_id?: string,
//   path?: string,
//   notes?: string,
// }

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function embedText(text: string): Promise<number[] | null> {
  const clipped = text.slice(0, 6000);
  // 1) tenta Google direto
  if (GOOGLE_AI_API_KEY) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GOOGLE_AI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text: clipped }] },
            outputDimensionality: EMBED_DIMS,
            taskType: "RETRIEVAL_DOCUMENT",
          }),
        },
      );
      if (r.ok) {
        const j = await r.json();
        const v = j?.embedding?.values;
        if (Array.isArray(v) && v.length === EMBED_DIMS) return v;
      }
    } catch (e) {
      console.warn("[training] gemini direct failed:", e);
    }
  }
  // 2) fallback Lovable Gateway
  if (LOVABLE_API_KEY) {
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({ model: `google/${EMBED_MODEL}`, input: clipped }),
      });
      if (r.ok) {
        const j = await r.json();
        const v = j?.data?.[0]?.embedding;
        if (Array.isArray(v) && v.length === EMBED_DIMS) return v;
      }
    } catch (e) {
      console.warn("[training] gateway failed:", e);
    }
  }
  return null;
}

async function updateAgentProfile(agentName: string) {
  // Lê últimas 20 validações desse agente para média móvel
  const { data: recent } = await admin
    .from("dataset_validated")
    .select("id, output_original, output_correto")
    .eq("agent", agentName)
    .order("created_at", { ascending: false })
    .limit(20);

  let qualitySum = 0;
  let count = 0;
  for (const row of recent ?? []) {
    const orig = JSON.stringify(row.output_original ?? {});
    const corr = JSON.stringify(row.output_correto ?? {});
    if (!orig || !corr) continue;
    // similaridade simples: quanto da extração original "sobreviveu" sem correção
    const distance = Math.abs(orig.length - corr.length) / Math.max(orig.length, corr.length, 1);
    const sim = Math.max(0, 1 - distance);
    qualitySum += sim;
    count++;
  }
  const quality = count > 0 ? qualitySum / count : 0.5;

  // Ajusta modelo/threshold com base no quality_score
  let recommendedModel: string | null = null;
  if (quality >= 0.9 && count >= 5) recommendedModel = "google/gemini-2.5-flash-lite";
  else if (quality < 0.6) recommendedModel = "google/gemini-2.5-pro";

  const patch: Record<string, unknown> = {
    quality_score: Number(quality.toFixed(4)),
    validation_count: count,
    last_validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (recommendedModel) patch.priority_model = recommendedModel;

  // upsert (cria perfil se não existe)
  const { data: existing } = await admin
    .from("agent_profiles")
    .select("agent_name")
    .eq("agent_name", agentName)
    .maybeSingle();

  if (existing) {
    await admin.from("agent_profiles").update(patch).eq("agent_name", agentName);
  } else {
    await admin.from("agent_profiles").insert({
      agent_name: agentName,
      temperature: 0.1,
      max_tokens: 4096,
      similarity_threshold: 0.75,
      max_examples: 3,
      use_structured_context: true,
      use_path_context: true,
      strict_mode: false,
      require_validation: true,
      priority_model: recommendedModel ?? "google/gemini-2.5-flash",
      ...patch,
    });
  }
  return { quality, count, recommendedModel };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth: precisa de usuário logado
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "missing auth token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "invalid auth" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verifica role permitido (consultor, coordenador ou gestor_ia)
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role));
  if (!roleSet.has("consultor") && !roleSet.has("coordenador") && !roleSet.has("gestor_ia")) {
    return new Response(JSON.stringify({ error: "permission denied (consultor/coordenador/gestor_ia)" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const classe = String(body?.classe || "").trim().toUpperCase();
  const input_text = String(body?.input_text || "").trim();
  const output_correto = body?.output_correto;
  if (!classe || !input_text || !output_correto) {
    return new Response(JSON.stringify({ error: "classe, input_text e output_correto são obrigatórios" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const agent = String(body?.agent || classe.toLowerCase()).trim();

  try {
    // 1) dataset_validated
    const { data: validatedRow, error: dsErr } = await admin
      .from("dataset_validated")
      .insert({
        extraction_id: body?.extraction_id ?? null,
        document_id: body?.document_id ?? null,
        rma_id: body?.rma_id ?? null,
        classe,
        agent,
        path: body?.path ?? null,
        input_text,
        normalized_text: input_text,
        output_original: body?.output_original ?? null,
        output_correto,
        corrections: body?.corrections ?? null,
        source: "manual_training",
        validated_by: userId,
        notes: body?.notes ?? null,
      })
      .select("id")
      .single();
    if (dsErr) throw new Error(`dataset_validated: ${dsErr.message}`);

    // 2) embedding + prompt_examples
    const vec = await embedText(input_text);
    let promptExampleId: string | null = null;
    if (vec) {
      const { data: peRow, error: peErr } = await admin
        .from("prompt_examples")
        .insert({
          validated_id: validatedRow!.id,
          classe,
          agent,
          input_text: input_text.slice(0, 8000),
          output_json: output_correto,
          embedding: `[${vec.join(",")}]`,
          weight: 1.5,
          active: true,
        })
        .select("id")
        .single();
      if (peErr) console.warn("[training] prompt_examples insert failed:", peErr.message);
      else promptExampleId = peRow!.id;
    } else {
      console.warn("[training] embedding indisponível — exemplo salvo só em dataset_validated");
    }

    // 3) agent_profiles
    const agentStats = await updateAgentProfile(agent);

    // 4) log
    await admin.from("pipeline_logs").insert({
      document_id: body?.document_id ?? null,
      step: "training_example_added",
      status: "success",
      details: {
        validated_id: validatedRow!.id,
        prompt_example_id: promptExampleId,
        classe, agent,
        user_id: userId,
        agent_quality: agentStats.quality,
        agent_validation_count: agentStats.count,
        recommended_model: agentStats.recommendedModel,
        embedding_ok: !!vec,
      },
    }).catch(() => {});

    return new Response(JSON.stringify({
      ok: true,
      validated_id: validatedRow!.id,
      prompt_example_id: promptExampleId,
      embedding_ok: !!vec,
      agent_profile: agentStats,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[training-save-example] error:", e);
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
