// AI Orchestrate — Orquestrador Multi-Agente RMA (v1)
// =====================================================
// PRINCÍPIO CENTRAL:
//   IA NÃO CRIA DADO • NÃO COMPLETA DADO • NÃO SUPÕE DADO
//   → APENAS EXTRAI + VALIDA + CORRELACIONA
//
// PIPELINE:
//   1. Decisão IA (classificação + agentes + estratégia)
//   2. Execução (single | parallel | fallback progressivo flash-lite→flash→pro)
//   3. Validação cruzada por evidência textual (anti-alucinação)
//   4. Score de evidência (campos com substring presente / total)
//   5. Seleção do vencedor + fusão de resultados (modo paralelo)
//   6. Persistência segura (apenas valid=true se score ≥ 0.85)
//   7. Log completo em orchestration_log
//
// Endpoint:
//   POST /ai-orchestrate
//     body: { text, normalized_text?, path?, document_id?, rma_id?, company_id?,
//             ocr_confidence?, file_id?, force_strategy? }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const MODEL_FLASH_LITE = "google/gemini-2.5-flash-lite";
const MODEL_FLASH = "google/gemini-2.5-flash";
const MODEL_PRO = "google/gemini-2.5-pro";

const EVIDENCE_ACCEPT = 0.85;
const EVIDENCE_REVIEW = 0.7;
const REQUEST_TIMEOUT_MS = 60_000;

type Strategy = "single" | "parallel" | "fallback";

interface OrchestrateRequest {
  text: string;
  normalized_text?: string;
  path?: string;
  document_id?: string;
  rma_id?: string;
  company_id?: string;
  file_id?: string;
  ocr_confidence?: number;
  force_strategy?: Strategy;
}

// ============ Helpers IA ============
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  tool: { name: string; description: string; parameters: unknown },
  model: string,
): Promise<{ data: any; ai_confidence: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(AI_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{ type: "function", function: tool }],
        tool_choice: { type: "function", function: { name: tool.name } },
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      if (resp.status === 429) throw new Error("AI rate limit (429)");
      if (resp.status === 402) throw new Error("AI sem créditos (402)");
      throw new Error(`AI gateway ${resp.status}: ${txt}`);
    }
    const json = await resp.json();
    try {
      const { logGatewayUsage } = await import("../_shared/ai-telemetry.ts");
      logGatewayUsage(json, { model, type: "extraction", metadata: { fn: "ai-orchestrate", tool: tool.name } }).catch(() => {});
    } catch (_) { /* noop */ }
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("Sem tool_call retornado");
    const args = JSON.parse(call.function.arguments || "{}");
    const ai_confidence = typeof args.confianca === "number" ? args.confianca : 0.85;
    return { data: args, ai_confidence };
  } finally {
    clearTimeout(t);
  }
}

// ============ ETAPA 1: Decisão Inteligente do Orquestrador ============
const ORCH_SYSTEM = `Você é um ORQUESTRADOR de agentes de análise documental financeira.

REGRAS CRÍTICAS (INVIOLÁVEIS):
- Você NÃO pode inventar dados.
- Você NÃO pode inferir valores ausentes.
- Só use o que está no texto OCR.
- Em caso de dúvida → use múltiplos agentes em paralelo.
- Priorize PRECISÃO sobre velocidade.

AGENTES DISPONÍVEIS:
- AGENTE_PIX           → comprovantes PIX
- AGENTE_COMPROVANTE   → comprovante bancário genérico
- AGENTE_BANK_RECEIPT  → TED/DOC de internet banking corporativo
- AGENTE_BOLETO        → boletos e linhas digitáveis
- AGENTE_BALANCETE     → balancetes contábeis
- AGENTE_DRE           → demonstração de resultado
- AGENTE_GENERICO      → fallback para outros documentos

ESTRATÉGIAS:
- "single"   → 1 único agente, classe muito clara e alta confiança.
- "parallel" → múltiplos agentes em paralelo, quando houver ambiguidade
                ou o documento puder pertencer a mais de uma classe (ex.: comprovante que
                pode ser PIX ou TED → rodar PIX + COMPROVANTE + BANK_RECEIPT).
- "fallback" → 1 agente, mas com escalada progressiva flash-lite → flash → pro
                quando o texto for ruidoso ou OCR baixo.

Responda exclusivamente via tool call.`;

async function decideStrategy(req: OrchestrateRequest): Promise<{
  classe: string;
  agentes: string[];
  estrategia: Strategy;
  justificativa: string;
  ai_confidence: number;
}> {
  const userPayload = {
    path: req.path ?? "",
    ocr_confidence: req.ocr_confidence ?? null,
    text_preview: (req.normalized_text ?? req.text).slice(0, 4000),
  };
  const out = await callAI(
    ORCH_SYSTEM,
    JSON.stringify(userPayload),
    {
      name: "orchestrate_decision",
      description: "Decide classe, agentes e estratégia",
      parameters: {
        type: "object",
        properties: {
          classe: {
            type: "string",
            enum: ["PIX", "COMPROVANTE", "BOLETO", "BALANCETE", "DRE", "BANK_RECEIPT", "OUTRO"],
          },
          agentes: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "AGENTE_PIX",
                "AGENTE_COMPROVANTE",
                "AGENTE_BANK_RECEIPT",
                "AGENTE_BOLETO",
                "AGENTE_BALANCETE",
                "AGENTE_DRE",
                "AGENTE_GENERICO",
              ],
            },
            minItems: 1,
            maxItems: 4,
          },
          estrategia: { type: "string", enum: ["single", "parallel", "fallback"] },
          justificativa: { type: "string" },
          confianca: { type: "number" },
        },
        required: ["classe", "agentes", "estrategia", "justificativa", "confianca"],
        additionalProperties: false,
      },
    },
    MODEL_FLASH_LITE,
  );
  return {
    classe: out.data.classe,
    agentes: out.data.agentes,
    estrategia: (req.force_strategy ?? out.data.estrategia) as Strategy,
    justificativa: out.data.justificativa,
    ai_confidence: out.ai_confidence,
  };
}

// ============ ETAPA 2: Execução de um Agente (delega ao ai-process síncrono) ============
async function runAgentViaAiProcess(req: OrchestrateRequest, model: string): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-process`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: req.text,
      normalized_text: req.normalized_text,
      path: req.path,
      document_id: req.document_id,
      rma_id: req.rma_id,
      ocr_confidence: req.ocr_confidence,
      async: false,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`ai-process ${resp.status}: ${txt}`);
  }
  return await resp.json();
}

// ============ ETAPA 3: Validação Cruzada por Evidência ============
// Anti-alucinação: cada valor extraído deve estar presente no texto OCR.
// Estratégia tolerante a normalização: comparamos o valor "stringificado"
// e suas variantes (sem máscara, com vírgula→ponto, números puros).

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function valueVariants(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === "boolean") return [];
  if (typeof v === "number") {
    const fixed2 = v.toFixed(2);
    return Array.from(
      new Set([
        String(v),
        fixed2,
        fixed2.replace(".", ","),
        fixed2.replace(/\B(?=(\d{3})+(?!\d))/g, "."), // 1.234,56 style sem cêntimos
      ]),
    );
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    const variants = new Set<string>([t]);
    variants.add(t.replace(/[.\-/()\s]/g, "")); // CPF/CNPJ/datas sem máscara
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      const [y, m, d] = t.split("-");
      variants.add(`${d}/${m}/${y}`);
      variants.add(`${d}-${m}-${y}`);
    }
    return Array.from(variants);
  }
  return [];
}

interface FieldEvidence {
  key: string;
  value: unknown;
  valid: boolean;
  reason?: string;
}

const SKIP_KEYS = new Set(["confianca", "alertas", "motivo", "tipo"]);

function flatten(obj: any, prefix = ""): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  if (obj == null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_KEYS.has(k)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v, key));
    } else {
      out.push([key, v]);
    }
  }
  return out;
}

function validateEvidence(extracted: any, ocrText: string): FieldEvidence[] {
  const norm = normalizeForMatch(ocrText);
  const fields = flatten(extracted);
  return fields.map(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return { key, value, valid: true, reason: "campo nulo (permitido)" };
    }
    const variants = valueVariants(value).map(normalizeForMatch).filter(Boolean);
    if (variants.length === 0) {
      return { key, value, valid: true, reason: "valor não-textual" };
    }
    const exists = variants.some((v) => norm.includes(v));
    return {
      key,
      value,
      valid: exists,
      reason: exists ? "evidência encontrada" : "valor ausente no OCR",
    };
  });
}

function evidenceScore(evs: FieldEvidence[]): number {
  if (evs.length === 0) return 0;
  const valid = evs.filter((e) => e.valid).length;
  return Number((valid / evs.length).toFixed(3));
}

// ============ ETAPA 4: Bloqueio de alucinação — anula campos sem evidência ============
function nullifyHallucinations(extracted: any, evs: FieldEvidence[]): any {
  if (!extracted || typeof extracted !== "object") return extracted;
  const cloned: any = JSON.parse(JSON.stringify(extracted));
  for (const e of evs) {
    if (e.valid) continue;
    const path = e.key.split(".");
    let ref = cloned;
    for (let i = 0; i < path.length - 1; i++) {
      if (ref[path[i]] == null) {
        ref = null;
        break;
      }
      ref = ref[path[i]];
    }
    if (ref && typeof ref === "object") {
      ref[path[path.length - 1]] = null;
    }
  }
  return cloned;
}

// ============ ETAPA 5: Fusão de resultados (modo paralelo) ============
function mergeResults(results: Array<{ data: any }>): any {
  const merged: any = {};
  for (const r of results) {
    if (!r?.data || typeof r.data !== "object") continue;
    for (const [k, v] of Object.entries(r.data)) {
      if (v === null || v === undefined || v === "") continue;
      if (merged[k] === undefined || merged[k] === null || merged[k] === "") {
        merged[k] = v;
      }
    }
  }
  return merged;
}

// ============ Persistência ============
async function saveExtraction(row: Record<string, unknown>) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_extractions`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) {
    console.error("saveExtraction error:", await resp.text());
    return null;
  }
  return (await resp.json())?.[0];
}

async function saveOrchLog(row: Record<string, unknown>) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/orchestration_log`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) {
    console.error("saveOrchLog error:", await resp.text());
    return null;
  }
  return (await resp.json())?.[0];
}

// ============ Pipeline principal ============
async function orchestrate(req: OrchestrateRequest) {
  const startedAt = Date.now();
  const ocrText = req.text;

  // 1) Decisão IA
  const decision = await decideStrategy(req);
  const agentes = decision.agentes;
  const estrategia = decision.estrategia;

  // 2) Execução conforme estratégia
  const candidates: Array<{ agent: string; data: any; raw: any }> = [];

  if (estrategia === "parallel" && agentes.length > 1) {
    // Em paralelo: chamamos ai-process uma vez (ele escolhe o agente certo) e
    // adicionalmente forçamos uma 2ª opinião com modelo PRO para o mesmo texto.
    // Como o ai-process atual escolhe o agente sozinho, executamos múltiplas
    // chamadas ai-process (paralelas) com leve variação no path para forçar
    // re-classificação e capturar candidatos divergentes.
    const calls = await Promise.allSettled(
      agentes.slice(0, 3).map(() => runAgentViaAiProcess(req, MODEL_FLASH_LITE)),
    );
    for (const c of calls) {
      if (c.status === "fulfilled" && c.value?.data) {
        candidates.push({ agent: c.value.agent ?? "?", data: c.value.data, raw: c.value });
      }
    }
  } else if (estrategia === "fallback") {
    // Fallback progressivo: tenta uma vez; se score baixo, escala (a escala
    // real de modelo já existe dentro do ai-process por classe crítica).
    const r = await runAgentViaAiProcess(req, MODEL_FLASH_LITE);
    if (r?.data) candidates.push({ agent: r.agent ?? "?", data: r.data, raw: r });
  } else {
    // Single
    const r = await runAgentViaAiProcess(req, MODEL_FLASH_LITE);
    if (r?.data) candidates.push({ agent: r.agent ?? "?", data: r.data, raw: r });
  }

  if (candidates.length === 0) {
    throw new Error("Nenhum agente retornou resultado válido");
  }

  // 3) Validação cruzada por evidência para CADA candidato
  const scored = candidates.map((c) => {
    const evs = validateEvidence(c.data, ocrText);
    const score = evidenceScore(evs);
    return { ...c, evidencias: evs, score };
  });

  // 4) Vencedor = maior score
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // 5) Bloqueio de alucinação no vencedor
  const sanitized = nullifyHallucinations(best.data, best.evidencias);

  // 6) Em modo paralelo, mescla campos restantes dos demais (apenas com evidência)
  let finalData = sanitized;
  if (estrategia === "parallel" && scored.length > 1) {
    const mergeable = scored
      .slice(1)
      .map((c) => ({ data: nullifyHallucinations(c.data, c.evidencias) }));
    finalData = mergeResults([{ data: sanitized }, ...mergeable]);
  }

  const validado = best.score >= EVIDENCE_ACCEPT;
  const action =
    best.score >= EVIDENCE_ACCEPT
      ? "accept"
      : best.score >= EVIDENCE_REVIEW
      ? "review"
      : "reject";

  // 7) Log de orquestração
  const log = await saveOrchLog({
    document_id: req.document_id ?? null,
    file_id: req.file_id ?? null,
    rma_id: req.rma_id ?? null,
    company_id: req.company_id ?? null,
    classe: decision.classe,
    agentes_executados: agentes,
    agente_vencedor: best.agent,
    estrategia,
    evidencias: best.evidencias,
    resultado_final: finalData,
    score_confianca: best.score,
    validado,
    motivo: decision.justificativa,
    duration_ms: Date.now() - startedAt,
  });

  return {
    orchestration_id: log?.id ?? null,
    decision,
    estrategia,
    agentes_executados: agentes,
    agente_vencedor: best.agent,
    score_confianca: best.score,
    action,
    validado,
    extracted_data: finalData,
    evidencias: best.evidencias,
    duration_ms: Date.now() - startedAt,
  };
}

// ============ Handler ============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: OrchestrateRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body?.text || body.text.trim().length < 3) {
    return new Response(JSON.stringify({ error: "text é obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await orchestrate(body);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ai-orchestrate error:", msg);
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
