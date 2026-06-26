// AI Prompt Builder — Endpoint dedicado (MD: PROMPT BUILDER INTELIGENTE)
// POST /ai-prompt-builder { text, classe, path?, agent?, top_k?, threshold? }
// Retorna { prompt, system, examples[], stats }.
//
// Reusa a mesma lógica de ranking do ai-process (similarity * weight + boost
// por pasta), mas é independente: útil para debug, preview no Gestor IA, e
// para clientes que queiram montar o prompt externamente.

import { generateEmbedding } from "../_shared/vertex-embeddings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const TOP_K_DEFAULT = 5;
const TOP_K_MAX = 10;
const THRESHOLD_DEFAULT = 0.7;
const PATH_BOOST = 0.15;
const EXAMPLE_MAX_CHARS = 600;
const TEXT_MAX_CHARS = 4000;

// Personas/system prompts mínimos por agente. Podem ser estendidos.
const AGENT_SYSTEMS: Record<string, string> = {
  AGENTE_PIX:
    "Você é um especialista em transações PIX. Extraia tipo, valor, data, pagador, beneficiário, banco e identificador da transação.",
  AGENTE_BOLETO:
    "Você é um especialista em boletos bancários. Extraia beneficiário, valor, vencimento, código de barras e linha digitável.",
  AGENTE_COMPROVANTE:
    "Você é um especialista em comprovantes financeiros. Extraia tipo, valor, data, partes envolvidas e identificadores.",
  AGENTE_BALANCETE:
    "Você é um especialista em balancetes contábeis. Extraia contas, saldos (devedor/credor), período e totais.",
  AGENTE_GENERICO:
    "Você é um especialista em documentos financeiros. Extraia campos relevantes em pares chave/valor.",
};

interface BuilderRequest {
  text: string;
  classe: string;
  path?: string;
  agent?: string;
  top_k?: number;
  threshold?: number;
  // ===== Adaptativo (v3) =====
  ocr_confidence?: number;   // 0..1 — usado para baixar threshold e escolher modelo
  company_id?: string;       // injeta memória company_context
  context_scope?: string;    // filtra company_context.scope
}

interface AgentProfile {
  agent_name: string;
  temperature: number;
  max_tokens: number;
  similarity_threshold: number;
  max_examples: number;
  use_structured_context: boolean;
  use_path_context: boolean;
  strict_mode: boolean;
  require_validation: boolean;
  priority_model: string;
}

const MODEL_MAP: Record<string, string> = {
  "flash-lite": "google/gemini-2.5-flash-lite",
  "flash":      "google/gemini-2.5-flash",
  "pro":        "google/gemini-2.5-pro",
};

async function loadAgentProfile(agent: string): Promise<AgentProfile | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_profiles?agent_name=eq.${encodeURIComponent(agent)}&select=*`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!r.ok) return null;
    const arr = await r.json();
    return Array.isArray(arr) && arr[0] ? arr[0] as AgentProfile : null;
  } catch { return null; }
}

async function loadCompanyContext(companyId: string, scope?: string): Promise<Array<{ chave: string; valor: string; scope: string }>> {
  try {
    const filter = scope ? `&scope=eq.${encodeURIComponent(scope)}` : "";
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/company_context?company_id=eq.${companyId}${filter}&select=chave,valor,scope&order=weight.desc&limit=20`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function loadCompanyRules(companyId: string): Promise<Array<{ regra: string; tipo: string; prioridade: number }>> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/company_rules?company_id=eq.${companyId}&ativa=eq.true&select=regra,tipo,prioridade&order=prioridade.desc&limit=20`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function loadCompanyMemory(
  companyId: string,
  embedding: number[] | null,
): Promise<Array<{ id: string; tipo: string; conteudo: string; similarity: number; weight: number }>> {
  if (!embedding) return [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_company_memory`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query_embedding: JSON.stringify(embedding),
        target_company_id: companyId,
        match_threshold: 0.62,
        match_count: 5,
      }),
    });
    if (!r.ok) { console.warn("match_company_memory:", await r.text()); return []; }
    return await r.json();
  } catch (e) { console.warn("loadCompanyMemory:", e); return []; }
}

function selectModel(profile: AgentProfile | null, ocrConfidence?: number): string {
  if (typeof ocrConfidence === "number" && ocrConfidence < 0.6) return MODEL_MAP.pro;
  const key = profile?.priority_model || "flash-lite";
  return MODEL_MAP[key] || MODEL_MAP["flash-lite"];
}

function adaptiveThreshold(profile: AgentProfile | null, requested: number | undefined, ocrConfidence?: number, agent?: string): number {
  let t = requested ?? profile?.similarity_threshold ?? THRESHOLD_DEFAULT;
  if (typeof ocrConfidence === "number" && ocrConfidence < 0.7) t -= 0.10;
  if (agent === "AGENTE_BALANCETE") t -= 0.05;
  return Math.min(Math.max(t, 0.30), 1);
}

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: auth, apikey: ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ?? null;
  } catch {
    return null;
  }
}

async function rpcSimilar(
  body: Record<string, unknown>,
  rpc: "search_prompt_examples" | "search_prompt_examples_by_path",
): Promise<any[]> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.error(`${rpc}:`, await resp.text());
      return [];
    }
    return await resp.json();
  } catch (e) {
    console.error(`${rpc} error:`, e);
    return [];
  }
}

interface RankedExample {
  id?: string;
  input_text: string;
  output_json: unknown;
  similarity: number;
  weight: number;
  path?: string | null;
  score: number;
  source: "classe" | "path";
}

async function rankExamples(
  classe: string,
  emb: number[] | null,
  path: string | undefined,
  topK: number,
  threshold: number,
): Promise<{ examples: RankedExample[]; embedding_dims: number | null }> {
  if (!emb) return { examples: [], embedding_dims: null };
  const embStr = JSON.stringify(emb);

  const [byClasse, byPath] = await Promise.all([
    rpcSimilar(
      {
        query_embedding: embStr,
        target_classe: classe,
        match_threshold: threshold,
        match_count: topK * 2,
      },
      "search_prompt_examples",
    ),
    path
      ? rpcSimilar(
        {
          query_embedding: embStr,
          target_classe: classe,
          target_path: path,
          match_threshold: threshold,
          match_count: topK,
        },
        "search_prompt_examples_by_path",
      )
      : Promise.resolve([]),
  ]);

  const merged = new Map<string, RankedExample>();
  for (const e of byClasse) {
    const w = Number(e.weight ?? 1);
    const sim = Number(e.similarity ?? 0);
    merged.set(e.id ?? e.input_text, {
      id: e.id,
      input_text: e.input_text,
      output_json: e.output_json,
      similarity: sim,
      weight: w,
      path: null,
      score: sim * w,
      source: "classe",
    });
  }
  for (const e of byPath) {
    const key = e.id ?? e.input_text;
    const w = Number(e.weight ?? 1);
    const sim = Number(e.similarity ?? 0);
    const boosted = sim * w + PATH_BOOST;
    const prev = merged.get(key);
    if (!prev || boosted > prev.score) {
      merged.set(key, {
        id: e.id,
        input_text: e.input_text,
        output_json: e.output_json,
        similarity: sim,
        weight: w,
        path: e.path ?? null,
        score: boosted,
        source: "path",
      });
    }
  }

  const examples = Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { examples, embedding_dims: emb.length };
}

function renderPrompt(
  text: string,
  classe: string,
  path: string | undefined,
  agent: string,
  examples: RankedExample[],
  profile: AgentProfile | null,
  companyMemory: Array<{ chave: string; valor: string; scope: string }>,
  semanticMemory: Array<{ tipo: string; conteudo: string; similarity: number }>,
  rules: Array<{ regra: string; tipo: string; prioridade: number }>,
): { system: string; user: string; full: string } {
  const baseSys = AGENT_SYSTEMS[agent] || AGENT_SYSTEMS.AGENTE_GENERICO;

  const fewShot = examples.length === 0
    ? [
      "",
      "Não há exemplos validados similares para este caso.",
      "Aplique o esquema padrão do agente e use null para campos sem evidência.",
    ].join("\n")
    : [
      "",
      "EXEMPLOS REAIS VALIDADOS (referência — não copie cegamente):",
      "",
      ...examples.map((ex, i) => {
        const inp = (ex.input_text || "").slice(0, EXAMPLE_MAX_CHARS);
        const out = JSON.stringify(ex.output_json, null, 2);
        return `Exemplo ${i + 1} (sim=${ex.similarity.toFixed(2)} w=${ex.weight} ${ex.source}${ex.path ? " path=" + ex.path : ""}):\nEntrada:\n"${inp}"\n\nSaída:\n${out}`;
      }),
    ].join("\n\n");

  const ctxLines: string[] = ["", "---", "Contexto do documento atual:", `- Classe: ${classe}`];
  if (path && (profile?.use_path_context ?? true)) ctxLines.push(`- Pasta: ${path}`);

  // Memória da empresa
  if (companyMemory.length > 0) {
    ctxLines.push("", "CONTEXTO DA EMPRESA (fatos validados):");
    for (const m of companyMemory.slice(0, 12)) {
      ctxLines.push(`- [${m.scope}] ${m.chave}: ${m.valor}`);
    }
  }

  // Memória semântica (RAG da empresa)
  if (semanticMemory.length > 0) {
    ctxLines.push("", "MEMÓRIA SEMÂNTICA DA EMPRESA (trechos relevantes do histórico):");
    for (const m of semanticMemory.slice(0, 5)) {
      ctxLines.push(`- [${m.tipo} sim=${m.similarity.toFixed(2)}] ${m.conteudo.slice(0, 240)}`);
    }
  }

  // Regras de negócio ativas
  if (rules.length > 0) {
    ctxLines.push("", "REGRAS ESPECÍFICAS DA EMPRESA (siga obrigatoriamente):");
    for (const r of rules.slice(0, 15)) {
      ctxLines.push(`- (${r.tipo} P${r.prioridade}) ${r.regra}`);
    }
  }
  if (profile?.use_structured_context) {
    ctxLines.push("", "ESTRUTURA ESPERADA: JSON estruturado com campos obrigatórios do schema do agente.");
  }

  ctxLines.push("", "REGRAS:");
  ctxLines.push("- Não invente dados.");
  ctxLines.push("- Se um campo não estiver no texto → null.");
  ctxLines.push("- Valide valores numéricos e datas.");
  ctxLines.push("- Retorne JSON estruturado.");
  if (profile?.strict_mode) {
    ctxLines.push("- MODO ESTRITO: proibido inferir valores sem evidência textual explícita.");
    ctxLines.push("- Toda extração numérica deve ter coerência aritmética.");
  }
  const ctx = ctxLines.filter(Boolean).join("\n");

  const system = baseSys + fewShot + ctx;
  const user = [
    "Texto OCR:",
    `"${text.slice(0, TEXT_MAX_CHARS)}"`,
  ].join("\n");
  const full = `[SYSTEM]\n${system}\n\n[USER]\n${user}`;

  return { system, user, full };
}

async function callRpc(req: Request, rpc: string, args: Record<string, unknown>) {
  const auth = req.headers.get("Authorization") || `Bearer ${SERVICE_KEY}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não suportado" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const uid = await getUserId(req);
  if (!uid) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Roteamento por ?action= (feedback | learn) — default: build
  const url = new URL(req.url);
  const action = (url.searchParams.get("action") || "build").toLowerCase();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === FEEDBACK: ajusta peso de um exemplo após validação ===
  if (action === "feedback") {
    const { example_id, success } = body || {};
    if (!example_id || typeof success !== "boolean") {
      return new Response(
        JSON.stringify({ error: "example_id e success (boolean) são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { ok, status, data } = await callRpc(req, "update_prompt_example_weight", {
      example_id, success,
    });
    return new Response(JSON.stringify(ok ? { success: true, updated: data } : { error: data }), {
      status: ok ? 200 : status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === LEARN: registra um novo exemplo validado com peso boost ===
  if (action === "learn") {
    const { classe, input_text, output_json, validated_id, agent, weight } = body || {};
    if (!classe || !input_text) {
      return new Response(
        JSON.stringify({ error: "classe e input_text são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { ok, status, data } = await callRpc(req, "learn_prompt_example", {
      p_classe: classe,
      p_input_text: input_text,
      p_output_json: output_json ?? {},
      p_validated_id: validated_id ?? null,
      p_agent: agent ?? null,
      p_weight: typeof weight === "number" ? weight : 1.2,
    });
    return new Response(JSON.stringify(ok ? { success: true, id: data } : { error: data }), {
      status: ok ? 200 : status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // === BUILD (default) ===

  if (!body?.text?.trim() || !body?.classe?.trim()) {
    return new Response(
      JSON.stringify({ error: "text e classe são obrigatórios" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const agent = body.agent || "AGENTE_GENERICO";

  try {
    // 1) Embedding único do texto (reusado em ranking + memória semântica)
    const emb = await generateEmbedding(body.text);

    // 2) Carrega perfil + contexto/memória/regras da empresa em paralelo
    const [profile, companyMemory, semanticMemory, rules] = await Promise.all([
      loadAgentProfile(agent),
      body.company_id ? loadCompanyContext(body.company_id, body.context_scope) : Promise.resolve([]),
      body.company_id ? loadCompanyMemory(body.company_id, emb) : Promise.resolve([]),
      body.company_id ? loadCompanyRules(body.company_id) : Promise.resolve([]),
    ]);

    // 3) Threshold e top_k adaptativos
    const threshold = adaptiveThreshold(profile, body.threshold, body.ocr_confidence, agent);
    const topK = Math.min(
      Math.max(body.top_k ?? profile?.max_examples ?? TOP_K_DEFAULT, 1),
      TOP_K_MAX,
    );

    // 4) Busca + ranking de exemplos
    const { examples, embedding_dims } = await rankExamples(
      body.classe, emb, body.path, topK, threshold,
    );

    // 5) Render do prompt com contexto adaptativo + memória semântica + regras
    const { system, user, full } = renderPrompt(
      body.text, body.classe, body.path, agent, examples, profile,
      companyMemory, semanticMemory, rules,
    );

    // 6) Modelo recomendado
    const recommended_model = selectModel(profile, body.ocr_confidence);

    return new Response(
      JSON.stringify({
        prompt: full,
        system,
        user,
        recommended_model,
        examples: examples.map((e) => ({
          id: e.id,
          similarity: e.similarity,
          weight: e.weight,
          score: e.score,
          source: e.source,
          path: e.path,
          input_preview: (e.input_text || "").slice(0, 200),
          output_json: e.output_json,
        })),
        profile: profile && {
          agent: profile.agent_name,
          temperature: profile.temperature,
          max_tokens: profile.max_tokens,
          strict_mode: profile.strict_mode,
          priority_model: profile.priority_model,
        },
        stats: {
          embedding_dims,
          examples_used: examples.length,
          top_k: topK,
          threshold,
          path_boost: body.path ? PATH_BOOST : 0,
          fallback: examples.length === 0,
          ocr_confidence: body.ocr_confidence ?? null,
          company_memory_count: companyMemory.length,
          semantic_memory_count: semanticMemory.length,
          rules_count: rules.length,
          recommended_model,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-prompt-builder error:", e);
    const msg = e instanceof Error ? e.message : "Erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
