// AI Process — Engine de Agentes (Produção)
// Pipeline: Classify → Router → Agente Especializado → Validador
// Modos:
//   - Assíncrono por padrão: retorna job imediatamente e processa em background.
//   - Síncrono apenas quando explicitamente solicitado para textos mínimos.
//   - Assíncrono em lote: textos longos → divide em chunks,
//     processa em background com EdgeRuntime.waitUntil e atualiza progress/status.
// Endpoints:
//   POST /ai-process            → inicia processamento (síncrono ou async)
//   POST /ai-process { async:true } com texto grande → 202 + { id, pollUrl }
//   GET  /ai-process?id=<uuid>  → status/progress/resultado parcial ou final

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { generateEmbedding as _vertexEmbed } from "../_shared/vertex-embeddings.ts";
import { logGatewayUsage } from "../_shared/ai-telemetry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_REQUEST_TIMEOUT_MS = 90_000;
const AI_MAX_RETRIES = 1;
// Caso 1: limites para bypass do Pro (texto grande estoura 180s no gateway).
// Pro só é tentado quando o payload (sys + user) for considerado curto.
const PRO_MAX_INPUT_CHARS = 8_000;

// ===== Estratégia de modelos (otimizada para custo — V2) =====
// Estágio 1: OCR puro → Google Vision (fora deste arquivo)
// Estágio 2: Extração JSON via cascata:
//   - Flash-Lite (padrão)  → classificação + agentes genéricos
//   - Flash (escalada)     → quando Flash-Lite tem confiança < 0.7
//   - Pro (último recurso) → apenas BALANCETE/DRE quando Flash também falha (<0.7)
//   * Estratégia anterior (BALANCETE/DRE direto em Pro) gerava ~US$ 6/dia.
//     Com cascata Flash→Pro a economia esperada é ~85%.
const MODEL_FLASH_LITE = "google/gemini-2.5-flash-lite";
const MODEL_FLASH = "google/gemini-2.5-flash";
const MODEL_PRO = "google/gemini-2.5-pro";
const DEFAULT_MODEL = MODEL_FLASH_LITE;
// Classes que justificam escalada para Pro como ÚLTIMO recurso
const PRO_FALLBACK_CLASSES = new Set(["BALANCETE", "DRE"]);
function pickAgentModel(_classe: string): string {
  // Sempre começar pelo modelo mais barato; cascata trata o resto
  return MODEL_FLASH_LITE;
}

// Heurística: ~3000 chars ≈ 1 página densa.
// O endpoint agora usa async por padrão para nunca segurar a conexão HTTP até 150s.
const CHARS_PER_PAGE = 3000;
const ASYNC_PAGE_THRESHOLD = 1;
const ASYNC_CHAR_THRESHOLD = CHARS_PER_PAGE * ASYNC_PAGE_THRESHOLD; // 3000
const SYNC_CHAR_THRESHOLD = 800;
const CHUNK_SIZE = CHARS_PER_PAGE; // 1 página por chunk para evitar estouro por chamada de IA

type Classe = "PIX" | "COMPROVANTE" | "BOLETO" | "BALANCETE" | "DRE" | "BANK_RECEIPT" | "NFE_COMPRAS" | "OUTRO";

interface ProcessRequest {
  document_id?: string;
  rma_id?: string;
  text: string;
  normalized_text?: string;
  path?: string;
  ocr_confidence?: number;
  /** Engine usado na conversão textual antes do LLM, ex.: sheetjs, google_vision. */
  source_engine?: string;
  /** Dica determinística de layout contábil calculada antes do LLM. */
  layout_hint?: "agrosys" | "nardelli" | "balancete_sheet" | "outro" | null;
  async?: boolean;
  /** ID de um job anterior canceled/failed para reaproveitar partial_results já calculados */
  resume_from_id?: string;
  /** Prompt extra (Smart Prompt MD) prefixado ao system do agente — opt-in via balancete-build */
  extra_system_prompt?: string;
}

const agentMap: Record<Classe, string> = {
  PIX: "AGENTE_PIX",
  COMPROVANTE: "AGENTE_COMPROVANTE",
  BOLETO: "AGENTE_BOLETO",
  BALANCETE: "AGENTE_BALANCETE",
  DRE: "AGENTE_BALANCETE",
  BANK_RECEIPT: "AGENTE_BANK_RECEIPT",
  NFE_COMPRAS: "AGENTE_NFE_COMPRAS_READER",
  OUTRO: "AGENTE_GENERICO",
};

// O OCR/parser pode devolver bytes NUL (\u0000) e outros controles invisíveis.
// Postgres rejeita NUL em campos text/jsonb e isso quebrava a criação do job.
function sanitizeTextForPostgres(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function sanitizeForPostgres<T>(value: T): T {
  if (typeof value === "string") return sanitizeTextForPostgres(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeForPostgres(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) out[key] = sanitizeForPostgres(entry);
    }
    return out as T;
  }
  return value;
}

function sanitizeProcessRequest(body: ProcessRequest): ProcessRequest {
  return sanitizeForPostgres({
    ...body,
    text: body.text,
    normalized_text: body.normalized_text,
    path: body.path,
    extra_system_prompt: body.extra_system_prompt,
  });
}

// ===== Heurística de pré-classificação por header (economiza chamada de IA) =====
// Detecta padrões fortes no início do texto para evitar a chamada do classifier LLM.
// Retorna null se nenhuma regra bater (cai no classifier IA padrão).
function detectBalanceteLayout(text: string, path?: string, sourceEngine?: string): ProcessRequest["layout_hint"] {
  const head = text.slice(0, 12_000).toLowerCase();
  const p = (path || "").toLowerCase();
  const hasBalanceCols = /saldo\s+anterior/.test(head) && /d[eé]bito|debito/.test(head) && /cr[eé]dito|credito/.test(head) && /saldo\s+(atual|final)/.test(head);
  const isBalancetePath = /balancete|balan[cç]o|raz[aã]o|cont[áa]bil|contabil/.test(p);
  const fromSheet = sourceEngine === "sheetjs" || /### sheet:/i.test(text);
  if (hasBalanceCols && fromSheet) return "agrosys";
  if (hasBalanceCols && /\s[dc]\s*(\n|;|\||$)/i.test(head)) return "nardelli";
  if (hasBalanceCols || (isBalancetePath && /balancete|balan[cç]o\s+patrimonial/.test(head))) return "balancete_sheet";
  return null;
}

function heuristicClassify(text: string, path?: string, sourceEngine?: string, layoutHint?: ProcessRequest["layout_hint"]): { classe: Classe; motivo: string } | null {
  const head = text.slice(0, 1500).toLowerCase();
  const p = (path || "").toLowerCase();
  const fname = p.split("/").pop() || "";

  const detectedLayout = layoutHint || detectBalanceteLayout(text, path, sourceEngine);
  if (detectedLayout && detectedLayout !== "outro") {
    return { classe: "BALANCETE", motivo: `layout contábil detectado (${detectedLayout})` };
  }

  // ── Roteamento determinístico por NOME DO ARQUIVO (evita classificar como BALANCETE) ──
  // Esses tipos não são balancete/DRE — vão para OUTRO até existirem agentes próprios.
  if (/\b(imobilizad[oa]|ativo[-_ ]?fixo)\b/.test(fname)) {
    return { classe: "OUTRO", motivo: "filename=imobilizado (não-balancete)" };
  }
  if (/(fornec|fornecedor)[-_ ]?(vencid|aberto|aberta|atraso|atrasad)/.test(fname)
      || /\b(contas?[-_ ]?(a[-_ ]?)?(pagar|receber))\b/.test(fname)) {
    return { classe: "OUTRO", motivo: "filename=fornecedores/contas a pagar (não-balancete)" };
  }
  if (/\bdemonstrativ[oa]\b/.test(fname) && !/dre|resultado/.test(fname)) {
    // "Demonstrativo de Estoque/Sede" — NÃO é DRE nem balancete
    return { classe: "OUTRO", motivo: "filename=demonstrativo (estoque/operacional)" };
  }
  if (/\bestoqu[ea]s?\b/.test(fname) || /invent[aá]rio/.test(fname)) {
    return { classe: "OUTRO", motivo: "filename=estoque/inventário" };
  }


  // Comprovantes bancários (Bradesco Net Empresa, Itaú Empresas, etc.)
  if (
    /bradesco\s*net\s*empresa|itau\s*empresas|santander\s*(net|empresarial)|sicoob\s*(empresarial|net)|caixa\s*empresa/i.test(head) ||
    /comprovante\s+(de\s+)?(transfer[eê]ncia|ted|doc|pagamento\s+a\s+fornecedor|d[eé]bito\s+autom[aá]tico)/i.test(head)
  ) {
    // PIX tem precedência se aparecer "pix"
    if (/\bpix\b/.test(head)) return { classe: "PIX", motivo: "header bancário + token pix" };
    return { classe: "BANK_RECEIPT", motivo: "header de internet banking corporativo" };
  }
  if (/\bpix\s+(realizado|enviado|recebido)\b/.test(head)) {
    return { classe: "PIX", motivo: "frase pix realizado/enviado" };
  }
  if (/linha\s+digit[aá]vel|c[oó]digo\s+de\s+barras/i.test(head) && /boleto|cobran[cç]a/.test(head)) {
    return { classe: "BOLETO", motivo: "linha digitável + boleto" };
  }
  if (/balancete\s+de\s+verifica[cç][aã]o|balan[cç]o\s+patrimonial/i.test(head)) {
    return { classe: "BALANCETE", motivo: "título balancete/balanço" };
  }
  if (/demonstra[cç][aã]o\s+(do|de)\s+resultado|\bdre\b/i.test(head)) {
    return { classe: "DRE", motivo: "título DRE" };
  }
  // Boost por pasta
  if (/\/comprovantes?\//.test(p) && /transfer|ted|doc|d[eé]bito/.test(head)) {
    return { classe: "BANK_RECEIPT", motivo: "pasta=comprovantes + token bancário" };
  }
  // Relação de Notas Fiscais de Compras (path forte ou cabeçalho típico)
  if (
    /rela[cç][aã]o\s+(de\s+)?notas?\s+fiscais?\s+(de\s+)?compras?/i.test(p) ||
    /rela[cç][aã]o\s+(de\s+)?notas?\s+fiscais?\s+(de\s+)?compras?/i.test(head) ||
    (/\/(notas?[-_ ]?fiscais?[-_ ]?(de[-_ ]?)?compras?|nfe[-_ ]?compras?)\//i.test(p))
  ) {
    return { classe: "NFE_COMPRAS", motivo: "pasta/header=Relação de NFs de Compras" };
  }
  return null;
}

// ===== Cache semântico para extrações (SHA-256 do prompt) =====
async function _sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function _cacheLookup(hash: string): Promise<{ data: any; ai_confidence: number } | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/llm_response_cache?prompt_hash=eq.${hash}&select=response,expires_at`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    const row = rows?.[0];
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    const resp = row.response || {};
    fetch(`${SUPABASE_URL}/rest/v1/rpc/bump_llm_cache_hit`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_hash: hash }),
    }).catch(() => {});
    return { data: resp.toolArgs, ai_confidence: resp.ai_confidence ?? 0.85 };
  } catch { return null; }
}

async function _cacheStore(hash: string, model: string, preview: string, args: any, conf: number) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/llm_response_cache`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        prompt_hash: hash,
        provider: "lovable",
        model,
        prompt_preview: preview.slice(0, 500),
        response: { toolArgs: args, ai_confidence: conf },
        expires_at: new Date(Date.now() + 168 * 3600_000).toISOString(),
      }),
    });
  } catch (_) { /* noop */ }
}

// ===== AI Gateway helper (structured output via tool calling) =====
// Caso 2: downgrade automático em timeout/5xx — se Pro estoura, tenta Flash;
// se Flash estoura, tenta Flash-Lite. Evita perder o chunk inteiro.
const MODEL_DOWNGRADE: Record<string, string | undefined> = {
  "google/gemini-2.5-pro": "google/gemini-2.5-flash",
  "google/gemini-2.5-flash": "google/gemini-2.5-flash-lite",
};

async function callAITool(
  systemPrompt: string,
  userPrompt: string,
  tool: { name: string; description: string; parameters: unknown },
  model: string = DEFAULT_MODEL,
  _downgradeDepth = 0,
): Promise<{ data: any; ai_confidence: number; model_used?: string }> {
  // Cache lookup primeiro (zero custo se hit)
  const cacheKey = JSON.stringify({ model, system: systemPrompt, user: userPrompt, tool: tool.name });
  const hash = await _sha256Hex(cacheKey);
  const hit = await _cacheLookup(hash);
  if (hit) {
    console.log(`[ai-process] cache HIT model=${model} tool=${tool.name}`);
    return hit;
  }

  let resp: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
      resp = await fetch(AI_URL, {
        method: "POST",
        signal: controller.signal,
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
      // Retry em 502/503/504 (gateway transitório)
      if (resp.status >= 502 && resp.status <= 504 && attempt < AI_MAX_RETRIES) {
        console.warn(`[ai-process] gateway ${resp.status}, retry ${attempt + 1}/${AI_MAX_RETRIES}`);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      break;
    } catch (err) {
      lastErr = err;
      const isAbort = (err as { name?: string })?.name === "AbortError";
      if (attempt < AI_MAX_RETRIES && isAbort) {
        console.warn(`[ai-process] timeout, retry ${attempt + 1}/${AI_MAX_RETRIES}`);
        continue;
      }
      if (isAbort) {
        // Caso 2: downgrade automático em timeout
        const fallback = MODEL_DOWNGRADE[model];
        if (fallback && _downgradeDepth < 2) {
          console.warn(`[ai-process] timeout em ${model} → downgrade para ${fallback}`);
          clearTimeout(timeout);
          return await callAITool(systemPrompt, userPrompt, tool, fallback, _downgradeDepth + 1);
        }
        throw new Error(`AI gateway timeout após ${Math.round(AI_REQUEST_TIMEOUT_MS / 1000)}s (${AI_MAX_RETRIES + 1} tentativas)`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!resp) throw (lastErr ?? new Error("AI gateway sem resposta"));

  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 429) throw new Error("AI rate limit (429): aguarde alguns segundos e tente novamente.");
    if (resp.status === 402) throw new Error("AI sem créditos (402): adicione créditos no workspace Lovable.");
    throw new Error(`AI gateway ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  logGatewayUsage(json, { model, type: "extraction", metadata: { tool: tool.name } }).catch(() => {});
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("Sem tool_call retornado");
  let args: any;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    throw new Error("AI retornou JSON inválido na chamada estruturada");
  }
  const ai_confidence = typeof args.confianca === "number" ? args.confianca : 0.85;
  // Cache store best-effort
  _cacheStore(hash, model, userPrompt, args, ai_confidence).catch(() => {});
  return { data: args, ai_confidence };
}

// ===== 1. CLASSIFICADOR =====
async function classify(text: string, path?: string, sourceEngine?: string, layoutHint?: ProcessRequest["layout_hint"]) {
  // 1) Tentativa heurística (sem custo de IA)
  const h = heuristicClassify(text, path, sourceEngine, layoutHint);
  if (h) {
    return { data: { classe: h.classe, confianca: 0.95, motivo: `heurística: ${h.motivo}` }, ai_confidence: 0.95 };
  }
  // 2) Fallback: classifier IA
  const sys =
    `Você é um classificador de documentos financeiros. ` +
    `Considere: texto OCR + caminho da pasta. ` +
    `Classes: PIX, COMPROVANTE, BOLETO, BALANCETE, DRE, BANK_RECEIPT, NFE_COMPRAS, OUTRO. ` +
    `Regras: "pix realizado/enviado" → PIX; tabela contábil/balancete → BALANCETE; ` +
    `demonstração de resultado → DRE; comprovante de TED/DOC/transferência de internet banking corporativo → BANK_RECEIPT; ` +
    `relação/listagem de notas fiscais de compras (planilha ou PDF tabular com fornecedor, CFOP, NCM, valor) → NFE_COMPRAS; ` +
    `"comprovante" genérico → COMPROVANTE; boleto/código de barras → BOLETO. ` +
    `A pasta INFLUENCIA fortemente a decisão (ex: "Relação de Notas Fiscais de Compras" → NFE_COMPRAS).`;
  const user = JSON.stringify({ path: path || "", text: text.slice(0, 4000) });
  return await callAITool(sys, user, {
    name: "classify_document",
    description: "Classifica documento financeiro",
    parameters: {
      type: "object",
      properties: {
        classe: { type: "string", enum: ["PIX", "COMPROVANTE", "BOLETO", "BALANCETE", "DRE", "BANK_RECEIPT", "NFE_COMPRAS", "OUTRO"] },
        confianca: { type: "number" },
        motivo: { type: "string" },
      },
      required: ["classe", "confianca", "motivo"],
      additionalProperties: false,
    },
  });
}

// ===== 4. AGENTES ESPECIALIZADOS =====
const agents: Record<string, { sys: string; tool: any }> = {
  AGENTE_PIX: {
    sys:
      `Você é especialista em comprovantes PIX. Extraia com precisão valor, data (YYYY-MM-DD), hora, ` +
      `pagador, destinatário, banco e id_transacao. CRÍTICO: nunca invente. Se não encontrar → null. ` +
      `Validar valor > 0.`,
    tool: {
      name: "extract_pix",
      description: "Extrai dados de comprovante PIX",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string" },
          valor: { type: ["number", "null"] },
          data: { type: ["string", "null"] },
          hora: { type: ["string", "null"] },
          pagador: { type: ["string", "null"] },
          destinatario: { type: ["string", "null"] },
          banco: { type: ["string", "null"] },
          id_transacao: { type: ["string", "null"] },
          confianca: { type: "number" },
        },
        required: ["tipo", "confianca"],
        additionalProperties: false,
      },
    },
  },
  AGENTE_COMPROVANTE: {
    sys:
      `Você analisa comprovantes bancários. Extraia valor, beneficiário, data, banco e tipo ` +
      `(pagamento|transferencia). Não invente.`,
    tool: {
      name: "extract_comprovante",
      description: "Extrai dados de comprovante bancário",
      parameters: {
        type: "object",
        properties: {
          valor: { type: ["number", "null"] },
          beneficiario: { type: ["string", "null"] },
          data: { type: ["string", "null"] },
          banco: { type: ["string", "null"] },
          tipo: { type: ["string", "null"], enum: ["pagamento", "transferencia", null] },
          confianca: { type: "number" },
        },
        required: ["confianca"],
        additionalProperties: false,
      },
    },
  },
  AGENTE_BOLETO: {
    sys:
      `Você analisa boletos. Extraia valor, vencimento, beneficiário, código de barras/linha digitável.`,
    tool: {
      name: "extract_boleto",
      description: "Extrai dados de boleto",
      parameters: {
        type: "object",
        properties: {
          valor: { type: ["number", "null"] },
          vencimento: { type: ["string", "null"] },
          beneficiario: { type: ["string", "null"] },
          linha_digitavel: { type: ["string", "null"] },
          confianca: { type: "number" },
        },
        required: ["confianca"],
        additionalProperties: false,
      },
    },
  },
  AGENTE_BALANCETE: {
    sys:
      `Você é contador especialista em BALANCETE DE VERIFICAÇÃO brasileiro. Reconheça e extraia 2 layouts:\n` +
      `\n` +
      `LAYOUT A — Agrosys/AgroWeb (9 colunas, XLSX/PDF):\n` +
      `  Conta | Descrição | Saldo Anterior | Movimento Débito | Movimento Crédito | Saldo Atual | D/C | (extras).\n` +
      `  Valores em formato BR (1.234.567,89). Sinal vem da coluna D/C (D=devedor, C=credor).\n` +
      `\n` +
      `LAYOUT B — Nardelli (6 colunas, PDF):\n` +
      `  Código | Descrição | Saldo Anterior | Débito | Crédito | Saldo Atual + sufixo " D" ou " C" no saldo.\n` +
      `  Sufixo D → positivo no ativo / negativo no passivo; C → inverso.\n` +
      `\n` +
      `EXTRAIA:\n` +
      `- Patrimoniais: ativo_total, passivo_total, patrimonio_liquido (com sinais corretos).\n` +
      `- Resultado: receita_bruta, receita_liquida, custos, despesas, resultado_periodo (lucro/prejuízo).\n` +
      `- margem_liquida = resultado_periodo / receita_liquida (se ambos existem).\n` +
      `- alertas: lucro_negativo, custo_alto, desbalanco_contabil (|Ativo - (Passivo+PL+Resultado)|/Ativo > 0.005).\n` +
      `- layout: "agrosys" | "nardelli" | "outro".\n` +
      `\n` +
      `REGRAS: (1.234,56) → -1234.56. Nunca invente — campo ausente → null.`,
    tool: {
      name: "extract_balancete",
      description: "Extrai dados de balancete de verificação (patrimonial + resultado)",
      parameters: {
        type: "object",
        properties: {
          layout: { type: ["string", "null"], enum: ["agrosys", "nardelli", "outro", null] },
          ativo_total: { type: ["number", "null"] },
          passivo_total: { type: ["number", "null"] },
          patrimonio_liquido: { type: ["number", "null"] },
          resultado_periodo: { type: ["number", "null"] },
          receita_bruta: { type: ["number", "null"] },
          receita_liquida: { type: ["number", "null"] },
          custos: { type: ["number", "null"] },
          despesas: { type: ["number", "null"] },
          lucro_liquido: { type: ["number", "null"] },
          margem_liquida: { type: ["number", "null"] },
          alertas: { type: "array", items: { type: "string" } },
          confianca: { type: "number" },
        },
        required: ["confianca"],
        additionalProperties: false,
      },
    },
  },
  AGENTE_BANK_RECEIPT: {
    sys:
      `Você é especialista em comprovantes bancários corporativos (TED/DOC/Transferência) emitidos por internet banking ` +
      `(Bradesco Net Empresa, Itaú Empresas, Santander, Sicoob, Caixa Empresa, etc.). ` +
      `Extraia origem (pagador), destino (favorecido), valor, data/hora, tipo_operacao e id_transacao. ` +
      `Limpe ruído (hashes de autenticação longos e textos de SAC/Ouvidoria). ` +
      `Sinalize parte_relacionada=true quando favorecido for sócio, administrador ou empresa do mesmo grupo. ` +
      `Nunca invente — campo ausente → null.`,
    tool: {
      name: "extract_bank_receipt",
      description: "Extrai dados de comprovante bancário corporativo (TED/DOC/Transferência)",
      parameters: {
        type: "object",
        properties: {
          tipo_operacao: { type: ["string", "null"], enum: ["TED", "DOC", "PIX", "TRANSFERENCIA", "PAGAMENTO_FORNECEDOR", "DEBITO_AUTOMATICO", null] },
          valor: { type: ["number", "null"] },
          data: { type: ["string", "null"] },
          hora: { type: ["string", "null"] },
          banco_emissor: { type: ["string", "null"] },
          pagador: {
            type: "object",
            properties: {
              nome: { type: ["string", "null"] },
              cnpj: { type: ["string", "null"] },
              agencia: { type: ["string", "null"] },
              conta: { type: ["string", "null"] },
            },
            additionalProperties: false,
          },
          favorecido: {
            type: "object",
            properties: {
              nome: { type: ["string", "null"] },
              cpf_cnpj: { type: ["string", "null"] },
              banco: { type: ["string", "null"] },
              agencia: { type: ["string", "null"] },
              conta: { type: ["string", "null"] },
            },
            additionalProperties: false,
          },
          id_transacao: { type: ["string", "null"] },
          finalidade: { type: ["string", "null"] },
          parte_relacionada: { type: ["boolean", "null"] },
          alertas: { type: "array", items: { type: "string" } },
          confianca: { type: "number" },
        },
        required: ["confianca"],
        additionalProperties: false,
      },
    },
  },
  AGENTE_NFE_COMPRAS_READER: {
    sys:
      `Você é especialista em leitura de RELAÇÃO DE NOTAS FISCAIS DE COMPRAS (Brasil). ` +
      `O documento é tipicamente uma planilha (XLSX/CSV) ou PDF tabular listando várias NFs. ` +
      `TAREFA: identificar TODAS as linhas que representam notas fiscais e extrair cada uma como item separado. ` +
      `REGRAS RÍGIDAS:\n` +
      `1) NUNCA invente. Campo ausente → null.\n` +
      `2) Datas → YYYY-MM-DD (interprete DD/MM/YYYY corretamente).\n` +
      `3) Valores → number (ponto decimal). Vírgula brasileira "1.234,56" → 1234.56. Parênteses → negativo.\n` +
      `4) CNPJ/CPF → apenas dígitos (14/11).\n` +
      `5) CFOP → 4 dígitos (ex: 1102, 2102, 5405).\n` +
      `6) Identifique colunas mesmo se o cabeçalho variar (Fornecedor / Razão Social / Emitente são equivalentes).\n` +
      `7) Se houver linhas de TOTAL/SUBTOTAL → ignore (não são notas).\n` +
      `8) tipo = "compra" sempre.\n` +
      `9) origem_arquivo deve refletir o nome do arquivo (use path).\n` +
      `10) linha_origem é o número da linha na planilha/tabela (1-based).\n` +
      `VALIDAÇÕES leves: data_emissao <= data_entrada (se ambas presentes); valor_total > 0; CNPJ com 14 dígitos.\n` +
      `Liste warnings[] para anomalias mas NUNCA descarte uma nota por causa delas.`,
    tool: {
      name: "extract_nfe_compras",
      description: "Extrai uma lista de notas fiscais de compras a partir de relação tabular",
      parameters: {
        type: "object",
        properties: {
          notas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                empresa:         { type: ["string", "null"] },
                cnpj:            { type: ["string", "null"] },
                fornecedor:      { type: ["string", "null"] },
                cnpj_fornecedor: { type: ["string", "null"] },
                numero_nota:     { type: ["string", "null"] },
                serie:           { type: ["string", "null"] },
                chave_nfe:       { type: ["string", "null"] },
                data_emissao:    { type: ["string", "null"] },
                data_entrada:    { type: ["string", "null"] },
                valor_total:     { type: ["number", "null"] },
                valor_produtos:  { type: ["number", "null"] },
                valor_frete:     { type: ["number", "null"] },
                valor_desconto:  { type: ["number", "null"] },
                valor_icms:      { type: ["number", "null"] },
                valor_ipi:       { type: ["number", "null"] },
                valor_pis:       { type: ["number", "null"] },
                valor_cofins:    { type: ["number", "null"] },
                valor_st:        { type: ["number", "null"] },
                cfop:            { type: ["string", "null"] },
                ncm:             { type: ["string", "null"] },
                natureza_operacao: { type: ["string", "null"] },
                descricao:       { type: ["string", "null"] },
                categoria:       { type: ["string", "null"] },
                tipo:            { type: "string" },
                linha_origem:    { type: ["integer", "null"] },
                warnings:        { type: "array", items: { type: "string" } },
              },
              required: ["tipo"],
              additionalProperties: false,
            },
          },
          totais: {
            type: "object",
            properties: {
              num_notas:        { type: "integer" },
              valor_total_geral:{ type: ["number", "null"] },
              icms_total:       { type: ["number", "null"] },
              ipi_total:        { type: ["number", "null"] },
            },
            additionalProperties: false,
          },
          alertas:   { type: "array", items: { type: "string" } },
          confianca: { type: "number" },
        },
        required: ["notas", "confianca"],
        additionalProperties: false,
      },
    },
  },
  AGENTE_GENERICO: {
    sys: `Você extrai informações chave de documentos diversos. Liste pares chave/valor relevantes.`,
    tool: {
      name: "extract_generico",
      description: "Extração genérica",
      parameters: {
        type: "object",
        properties: {
          campos: {
            type: "array",
            items: {
              type: "object",
              properties: { chave: { type: "string" }, valor: { type: "string" } },
              required: ["chave", "valor"],
              additionalProperties: false,
            },
          },
          confianca: { type: "number" },
        },
        required: ["campos", "confianca"],
        additionalProperties: false,
      },
    },
  },
};

// ===== Prompt Builder Inteligente =====
// Estratégia (MD §1-§10):
//   1. Gera embedding do texto OCR normalizado (Vertex AI 768D).
//   2. Busca exemplos validados por classe (search_prompt_examples).
//   3. Boost por pasta (search_prompt_examples_by_path) — exemplos da mesma
//      pasta recebem peso extra no ranking.
//   4. Score final = similarity * weight (peso por confiança/curadoria).
//   5. Mescla, deduplica, ordena, top-K (≤ 5).
//   6. Trunca cada exemplo para conter o prompt (<8k tokens estimados).
//   7. Fallback inteligente quando não há exemplos.
const embedText = _vertexEmbed;

const PROMPT_BUILDER_TOP_K = 5;
const PROMPT_BUILDER_PATH_BOOST = 0.15; // soma 15% ao score quando a pasta bate
const PROMPT_BUILDER_EXAMPLE_MAX_CHARS = 600;
const PROMPT_BUILDER_THRESHOLD = 0.7;

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

async function rpcSimilarExamples(
  body: Record<string, unknown>,
  rpcName: "search_prompt_examples" | "search_prompt_examples_by_path",
): Promise<any[]> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.error(`${rpcName}:`, await resp.text());
      return [];
    }
    return await resp.json();
  } catch (e) {
    console.error(`${rpcName} error:`, e);
    return [];
  }
}

async function fetchSimilarExamples(
  classe: string,
  text: string,
  path?: string,
  matchCount = PROMPT_BUILDER_TOP_K,
): Promise<RankedExample[]> {
  const emb = await embedText(text);
  if (!emb) return [];
  const embStr = JSON.stringify(emb);

  // Busca paralela: pool por classe + pool boosted por pasta
  const [byClasse, byPath] = await Promise.all([
    rpcSimilarExamples(
      {
        query_embedding: embStr,
        target_classe: classe,
        match_threshold: PROMPT_BUILDER_THRESHOLD,
        match_count: matchCount * 2,
      },
      "search_prompt_examples",
    ),
    path
      ? rpcSimilarExamples(
        {
          query_embedding: embStr,
          target_classe: classe,
          target_path: path,
          match_threshold: PROMPT_BUILDER_THRESHOLD,
          match_count: matchCount,
        },
        "search_prompt_examples_by_path",
      )
      : Promise.resolve([]),
  ]);

  const merged = new Map<string, RankedExample>();
  for (const e of byClasse) {
    const w = Number(e.weight ?? 1);
    const sim = Number(e.similarity ?? 0);
    merged.set(e.id ?? `${e.input_text}`, {
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
    const key = e.id ?? `${e.input_text}`;
    const w = Number(e.weight ?? 1);
    const sim = Number(e.similarity ?? 0);
    const boosted = sim * w + PROMPT_BUILDER_PATH_BOOST;
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

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, matchCount);
}

function buildFewShotBlock(
  examples: RankedExample[],
  ctx: { classe: string; path?: string },
): string {
  if (examples.length === 0) {
    // Fallback inteligente
    return [
      "",
      "",
      `Contexto do documento:`,
      `- Classe: ${ctx.classe}`,
      ctx.path ? `- Pasta: ${ctx.path}` : "",
      "",
      "Não há exemplos validados para este caso. Aplique o esquema padrão",
      "do agente, extraia apenas o que estiver explícito no texto OCR e use",
      "null para campos sem evidência.",
    ].filter(Boolean).join("\n");
  }
  const lines = examples.map((ex, i) => {
    const inp = (ex.input_text || "").slice(0, PROMPT_BUILDER_EXAMPLE_MAX_CHARS);
    const out = JSON.stringify(ex.output_json);
    return `Exemplo ${i + 1} (sim=${ex.similarity.toFixed(2)} w=${ex.weight} ${ex.source}${ex.path ? " path=" + ex.path : ""}):\nEntrada: ${inp}\nSaída: ${out}`;
  });
  return [
    "",
    "",
    "EXEMPLOS REAIS VALIDADOS (referência — não copie cegamente):",
    lines.join("\n\n"),
    "",
    "---",
    "Contexto do documento atual:",
    `- Classe: ${ctx.classe}`,
    ctx.path ? `- Pasta: ${ctx.path}` : "",
    "",
    "REGRAS:",
    "- Não invente dados.",
    "- Se um campo não estiver no texto → null.",
    "- Valide valores numéricos e datas.",
    "- Retorne JSON estruturado conforme o tool schema.",
    "",
    "Agora analise o documento atual:",
  ].filter(Boolean).join("\n");
}

async function runAgent(
  agentName: string,
  classe: string,
  raw: string,
  normalized: string,
  path?: string,
  extraSystemPrompt?: string,
  layoutHint?: ProcessRequest["layout_hint"],
  sourceEngine?: string,
) {
  const a = agents[agentName] || agents.AGENTE_GENERICO;
  const examples = await fetchSimilarExamples(
    classe,
    normalized || raw,
    path,
    PROMPT_BUILDER_TOP_K,
  );
  const layoutBlock = layoutHint
    ? `\n\nLAYOUT_HINT_DETERMINÍSTICO: ${layoutHint}. Engine de texto: ${sourceEngine || "desconhecido"}. Use esta dica para interpretar colunas/sinais, mas extraia apenas valores explícitos no texto.`
    : "";
  const baseSys = extraSystemPrompt
    ? `${extraSystemPrompt}\n\n---\n\n${a.sys}`
    : a.sys;
  const sysAugmented = baseSys + layoutBlock + buildFewShotBlock(examples, { classe, path });
  const user = JSON.stringify({
    raw_text: raw.slice(0, 4000),
    normalized_text: normalized.slice(0, 4000),
    path: path || "",
    layout_hint: layoutHint || null,
    source_engine: sourceEngine || null,
  });
  // Cascata em 3 níveis para minimizar custo:
  //  1) Flash-Lite (padrão, ~baratíssimo)
  //  2) Flash      → escala se confiança < 0.7
  //  3) Pro        → último recurso APENAS para BALANCETE/DRE se Flash também < 0.7
  let result = await callAITool(sysAugmented, user, a.tool, MODEL_FLASH_LITE);
  let modelUsed = MODEL_FLASH_LITE;
  if (result.ai_confidence < 0.7) {
    const upgraded = await callAITool(sysAugmented, user, a.tool, MODEL_FLASH);
    if (upgraded.ai_confidence > result.ai_confidence) {
      result = upgraded;
      modelUsed = MODEL_FLASH;
    }
    if (result.ai_confidence < 0.7 && PRO_FALLBACK_CLASSES.has(classe)) {
      // Caso 1: só escala para Pro se o payload couber no orçamento de tempo
      const payloadChars = sysAugmented.length + user.length;
      if (payloadChars <= PRO_MAX_INPUT_CHARS) {
        const pro = await callAITool(sysAugmented, user, a.tool, MODEL_PRO);
        if (pro.ai_confidence > result.ai_confidence) {
          result = pro;
          modelUsed = MODEL_PRO;
        }
      } else {
        console.log(`[ai-process] bypass Pro: payload ${payloadChars} chars > ${PRO_MAX_INPUT_CHARS} (usando Flash)`);
      }
    }
  }
  return { ...result, examples_used: examples.length, model_used: modelUsed };
}

// (Reuso externo: edge function ai-prompt-builder reimplementa o ranking
// para isolamento — não importa daqui para evitar acoplamento entre funções.)

// ===== 5. VALIDADOR =====
async function validate(extracted: any, raw_text: string) {
  const sys =
    `Você é auditor. Valide o JSON comparando com o texto OCR. ` +
    `Verifique: valores existem no texto? datas válidas? campos obrigatórios preenchidos? ` +
    `Se não houver evidência → marque correção com chave e valor null. Não invente.`;
  const user = JSON.stringify({ extracted, raw_text: raw_text.slice(0, 4000) });
  // Validação roda em Flash (modelo Pro ficou caro demais; Flash é suficiente
  // pois só compara JSON contra texto OCR — não há raciocínio contábil pesado)
  return await callAITool(sys, user, {
    name: "validate_extraction",
    description: "Valida extração contra OCR",
    parameters: {
      type: "object",
      properties: {
        valido: { type: "boolean" },
        correcoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              campo: { type: "string" },
              valor_anterior: {},
              valor_corrigido: {},
              motivo: { type: "string" },
            },
            required: ["campo", "motivo"],
            additionalProperties: false,
          },
        },
        confianca: { type: "number" },
      },
      required: ["valido", "correcoes", "confianca"],
      additionalProperties: false,
    },
  }, MODEL_FLASH);
}

// ===== Persistência =====
async function dbInsert(row: Record<string, unknown>) {
  const sanitizedRow = sanitizeForPostgres(row);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_extractions`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(sanitizedRow),
  });
  if (!resp.ok) {
    console.error("dbInsert error:", await resp.text());
    return null;
  }
  return (await resp.json())?.[0];
}

async function dbUpdate(id: string, patch: Record<string, unknown>) {
  const sanitizedPatch = sanitizeForPostgres(patch);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_extractions?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sanitizedPatch),
  });
  if (!resp.ok) console.error("dbUpdate error:", await resp.text());
}

async function dbGet(id: string) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/ai_extractions?id=eq.${id}&select=*`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    },
  );
  if (!resp.ok) return null;
  return (await resp.json())?.[0] ?? null;
}

// ===== Persistência específica: NFE_COMPRAS =====
// Insere cada nota fiscal extraída na tabela `nfe_compras`. Sem-op se merged.notas vazio.
async function persistNfeCompras(args: {
  extraction_id: string;
  rma_id?: string;
  path?: string;
  merged: any;
  confidence: number;
}): Promise<void> {
  const notas: any[] = Array.isArray(args.merged?.notas) ? args.merged.notas : [];
  if (notas.length === 0) return;

  const fileName = (args.path || "").split("/").pop() || null;

  const onlyDigits = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).replace(/\D+/g, "");
    return s.length > 0 ? s : null;
  };
  const toDate = (v: unknown): string | null => {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
  };
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const cleaned = String(v).replace(/[^\d.,\-()]/g, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  // Heurística de confiança por linha: começa do score base e penaliza por discrepâncias verificáveis.
  // Cada warning é serializado como "campo:motivo" para a UI poder destacar.
  const scoreRow = (raw: any, normalized: any): { score: number; warnings: string[] } => {
    const w: string[] = Array.isArray(raw?.warnings) ? [...raw.warnings] : [];
    let penalty = 0;
    const add = (field: string, reason: string, p: number) => {
      w.push(`${field}:${reason}`);
      penalty += p;
    };

    // CNPJ — fornecedor é o mais crítico
    if (raw?.cnpj_fornecedor && !normalized.cnpj_fornecedor) add("cnpj_fornecedor", "formato inválido", 0.15);
    else if (normalized.cnpj_fornecedor && normalized.cnpj_fornecedor.length !== 14) add("cnpj_fornecedor", `${normalized.cnpj_fornecedor.length} dígitos`, 0.15);
    else if (!normalized.cnpj_fornecedor) add("cnpj_fornecedor", "ausente", 0.10);
    if (raw?.cnpj && !normalized.cnpj) add("cnpj", "formato inválido", 0.05);

    // Datas
    if (raw?.data_emissao && !normalized.data_emissao) add("data_emissao", "formato inválido", 0.10);
    if (raw?.data_entrada && !normalized.data_entrada) add("data_entrada", "formato inválido", 0.05);
    if (normalized.data_emissao && normalized.data_entrada && normalized.data_emissao > normalized.data_entrada) {
      add("data_emissao", "emissão posterior à entrada", 0.10);
    }
    if (normalized.data_emissao) {
      const y = Number(normalized.data_emissao.slice(0, 4));
      const cur = new Date().getUTCFullYear();
      if (y < 2000 || y > cur + 1) add("data_emissao", `ano fora do intervalo (${y})`, 0.10);
    }

    // Totais
    const vt = normalized.valor_total ?? 0;
    if (vt <= 0) add("valor_total", "≤ 0", 0.20);
    const partes = [
      normalized.valor_produtos, normalized.valor_frete,
      normalized.valor_ipi, normalized.valor_st,
    ].filter((x: number | null) => typeof x === "number") as number[];
    if (vt > 0 && partes.length >= 2) {
      const soma = partes.reduce((a, b) => a + b, 0) - (normalized.valor_desconto ?? 0);
      if (soma > 0) {
        const diff = Math.abs(vt - soma) / Math.max(vt, soma);
        if (diff > 0.02) add("valor_total", `diverge da soma de componentes em ${(diff * 100).toFixed(1)}%`, diff > 0.10 ? 0.20 : 0.10);
      }
    }
    // Impostos não podem exceder o total
    for (const k of ["valor_icms", "valor_ipi", "valor_pis", "valor_cofins", "valor_st"]) {
      const v = normalized[k];
      if (typeof v === "number" && vt > 0 && v > vt) add(k, `excede valor_total`, 0.10);
    }

    // CFOP / NCM
    if (raw?.cfop && (!normalized.cfop || !/^\d{4}$/.test(normalized.cfop))) add("cfop", "deve ter 4 dígitos", 0.05);
    if (raw?.ncm && normalized.ncm && !/^\d{6,8}$/.test(normalized.ncm)) add("ncm", "formato inválido", 0.03);

    // Identificação mínima
    if (!normalized.numero_nota) add("numero_nota", "ausente", 0.10);
    if (!normalized.fornecedor && !normalized.cnpj_fornecedor) add("fornecedor", "ausente", 0.10);

    const score = Math.max(0, Math.min(1, args.confidence - penalty));
    return { score: Number(score.toFixed(3)), warnings: w };
  };

  const rows = notas.map((n, idx) => {
    const normalized = {
      empresa: n?.empresa ?? null,
      cnpj: onlyDigits(n?.cnpj),
      fornecedor: n?.fornecedor ?? null,
      cnpj_fornecedor: onlyDigits(n?.cnpj_fornecedor),
      numero_nota: n?.numero_nota != null ? String(n.numero_nota) : null,
      serie: n?.serie != null ? String(n.serie) : null,
      chave_nfe: onlyDigits(n?.chave_nfe),
      data_emissao: toDate(n?.data_emissao),
      data_entrada: toDate(n?.data_entrada),
      valor_total: toNum(n?.valor_total),
      valor_produtos: toNum(n?.valor_produtos),
      valor_frete: toNum(n?.valor_frete),
      valor_desconto: toNum(n?.valor_desconto),
      valor_icms: toNum(n?.valor_icms),
      valor_ipi: toNum(n?.valor_ipi),
      valor_pis: toNum(n?.valor_pis),
      valor_cofins: toNum(n?.valor_cofins),
      valor_st: toNum(n?.valor_st),
      cfop: n?.cfop != null ? String(n.cfop) : null,
      ncm: n?.ncm != null ? String(n.ncm) : null,
      natureza_operacao: n?.natureza_operacao ?? null,
      descricao: n?.descricao ?? null,
      categoria: n?.categoria ?? null,
      tipo: typeof n?.tipo === "string" ? n.tipo : "compra",
    };
    const { score, warnings } = scoreRow(n, normalized);
    return {
      extraction_id: args.extraction_id,
      rma_id: args.rma_id ?? null,
      ...normalized,
      origem_arquivo: fileName,
      linha_origem: typeof n?.linha_origem === "number" ? n.linha_origem : (idx + 1),
      confidence_score: score,
      warnings,
    };
  });

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/nfe_compras`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!resp.ok) {
      console.error("persistNfeCompras error:", resp.status, await resp.text());
    } else {
      console.log(`persistNfeCompras: ${rows.length} nota(s) inseridas (extraction=${args.extraction_id})`);
    }
  } catch (e) {
    console.error("persistNfeCompras exception:", e);
  }
}

// ===== Chunking =====
function splitText(text: string, size: number): string[] {
  const chunks: string[] = [];
  // Tenta quebrar em fronteira de parágrafo/linha quando possível
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const nl = slice.lastIndexOf("\n\n");
      const ln = slice.lastIndexOf("\n");
      const cut = nl > size * 0.5 ? nl : ln > size * 0.5 ? ln : -1;
      if (cut > 0) end = i + cut;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

// ===== Agregação =====
function mergeExtractions(parts: any[], classe: Classe): any {
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];

  // Para BALANCETE/DRE: somar campos numéricos
  if (classe === "BALANCETE" || classe === "DRE") {
    const sum = (k: string) =>
      parts.reduce((acc, p) => acc + (typeof p?.[k] === "number" ? p[k] : 0), 0) || null;
    const first = (k: string) => parts.find((p) => p?.[k] != null)?.[k] ?? null;
    const alertas = parts.flatMap((p) => p?.alertas ?? []);
    const receita_liquida = sum("receita_liquida");
    const lucro_liquido = sum("lucro_liquido");
    const resultado_periodo = sum("resultado_periodo") ?? lucro_liquido;
    const ativo_total = sum("ativo_total");
    const passivo_total = sum("passivo_total");
    const patrimonio_liquido = sum("patrimonio_liquido");
    // Checagem contábil: |Ativo - (Passivo + PL + Resultado)| / Ativo < 0.5%
    const finalAlertas = new Set(alertas);
    if (ativo_total && (passivo_total != null || patrimonio_liquido != null)) {
      const direito = (passivo_total ?? 0) + (patrimonio_liquido ?? 0) + (resultado_periodo ?? 0);
      const diff = Math.abs(ativo_total - direito);
      if (diff / Math.abs(ativo_total) > 0.005) {
        finalAlertas.add(`desbalanco_contabil: |${ativo_total.toFixed(2)} - ${direito.toFixed(2)}| = ${diff.toFixed(2)}`);
      }
    }
    return {
      layout: first("layout"),
      ativo_total,
      passivo_total,
      patrimonio_liquido,
      resultado_periodo,
      receita_bruta: sum("receita_bruta"),
      receita_liquida,
      custos: sum("custos"),
      despesas: sum("despesas"),
      lucro_liquido,
      margem_liquida:
        receita_liquida && lucro_liquido != null
          ? Number((lucro_liquido / receita_liquida).toFixed(4))
          : null,
      alertas: Array.from(finalAlertas),
      confianca:
        parts.reduce((a, p) => a + (p?.confianca ?? 0), 0) / parts.length,
    };
  }

  // Para NFE_COMPRAS: concatena notas[] de todos os chunks
  if (classe === "NFE_COMPRAS") {
    const allNotas = parts.flatMap((p) => Array.isArray(p?.notas) ? p.notas : []);
    const allAlertas = Array.from(new Set(parts.flatMap((p) => p?.alertas ?? [])));
    const valor_total_geral = allNotas.reduce(
      (a, n) => a + (typeof n?.valor_total === "number" ? n.valor_total : 0),
      0,
    ) || null;
    const icms_total = allNotas.reduce(
      (a, n) => a + (typeof n?.valor_icms === "number" ? n.valor_icms : 0),
      0,
    ) || null;
    const ipi_total = allNotas.reduce(
      (a, n) => a + (typeof n?.valor_ipi === "number" ? n.valor_ipi : 0),
      0,
    ) || null;
    return {
      notas: allNotas,
      totais: { num_notas: allNotas.length, valor_total_geral, icms_total, ipi_total },
      alertas: allAlertas,
      confianca: parts.reduce((a, p) => a + (p?.confianca ?? 0), 0) / parts.length,
    };
  }

  // Para PIX/COMPROVANTE/BOLETO: lista de itens
  return {
    itens: parts,
    total: parts.length,
    confianca: parts.reduce((a, p) => a + (p?.confianca ?? 0), 0) / parts.length,
  };
}

// ===== Pipeline síncrono (single chunk) =====
async function runPipelineSingle(req: ProcessRequest) {
  const text = req.text;
  const normalized = req.normalized_text || text;
  const layoutHint = req.layout_hint || detectBalanceteLayout(normalized, req.path, req.source_engine);

  const cls = await classify(normalized, req.path, req.source_engine, layoutHint);
  const classe = cls.data.classe as Classe;
  const agent = agentMap[classe];

  const ext = await runAgent(agent, classe, text, normalized, req.path, req.extra_system_prompt, layoutHint, req.source_engine);
  const val = await validate(ext.data, text);

  const ocr = req.ocr_confidence ?? 0.9;
  const ai = (cls.ai_confidence + ext.ai_confidence + val.ai_confidence) / 3;
  const final_conf = Number((ocr * 0.4 + ai * 0.6).toFixed(3));

  return {
    classe,
    agent,
    classification: cls.data,
    extracted: ext.data,
    validation: val.data,
    ocr_conf: ocr,
    ai_conf: Number(ai.toFixed(3)),
    final_conf,
  };
}

// ===== Pipeline assíncrono em lote =====
async function runPipelineAsync(id: string, req: ProcessRequest) {
  const startedAt = Date.now();
  const text = req.text;
  const normalized = req.normalized_text || text;
  const layoutHint = req.layout_hint || detectBalanceteLayout(normalized, req.path, req.source_engine);

  try {
    await dbUpdate(id, { status: "processing", progress: 5 });

    // 0. Recuperar partial_results do job anterior, se houver retry
    let resumed: any[] = [];
    if (req.resume_from_id) {
      const prev = await dbGet(req.resume_from_id);
      if (Array.isArray(prev?.partial_results)) {
        resumed = prev.partial_results as any[];
        console.log(
          `Retry de ${req.resume_from_id}: reaproveitando ${resumed.length} chunk(s) já processados`,
        );
      }
    }

    // 1. Classificar (uma vez, com início do texto)
    const cls = await classify(normalized, req.path, req.source_engine, layoutHint);
    const classe = cls.data.classe as Classe;
    const agent = agentMap[classe];

    // 2. Dividir em chunks de ~5 páginas
    const rawChunks = splitText(text, CHUNK_SIZE);
    const normChunks = splitText(normalized, CHUNK_SIZE);
    const total = rawChunks.length;

    // Se o número de chunks reaproveitados não bate com o total, descarta para evitar inconsistência
    if (resumed.length > total) resumed = resumed.slice(0, total);

    const startIdx = resumed.length;
    const partials: any[] = [...resumed];
    let aiSum = cls.ai_confidence;
    let aiN = 1;

    await dbUpdate(id, {
      classe,
      agent,
      chunks_total: total,
      chunks_processed: startIdx,
      progress: startIdx > 0 ? Math.min(10 + Math.round((startIdx / total) * 75), 85) : 10,
      partial_results: partials,
    });

    // 3. Processar cada chunk restante
    for (let i = startIdx; i < total; i++) {
      // Verificação cooperativa de cancelamento entre chunks
      const current = await dbGet(id);
      if (current?.status === "canceled" || current?.status === "failed") {
        console.log(`Job ${id} cancelado pelo usuário no chunk ${i}/${total}`);
        await dbUpdate(id, {
          partial_results: partials,
          duration_ms: Date.now() - startedAt,
        });
        return;
      }

      const raw = rawChunks[i];
      const norm = normChunks[i] ?? raw;

      const ext = await runAgent(agent, classe, raw, norm, req.path, req.extra_system_prompt, layoutHint, req.source_engine);
      partials.push(ext.data);
      aiSum += ext.ai_confidence;
      aiN += 1;

      const processed = i + 1;
      const progress = Math.min(10 + Math.round((processed / total) * 75), 85);
      await dbUpdate(id, {
        chunks_processed: processed,
        progress,
        partial_results: partials,
      });
    }

    // Checa cancelamento antes da agregação/validação final
    const beforeFinal = await dbGet(id);
    if (beforeFinal?.status === "canceled") {
      console.log(`Job ${id} cancelado antes da consolidação`);
      return;
    }

    // 4. Agregar
    const merged = mergeExtractions(partials, classe);

    // 5. Validar resultado consolidado contra um sample do texto
    const sample =
      text.slice(0, 2000) + (text.length > 4000 ? "\n...\n" + text.slice(-2000) : "");
    const val = await validate(merged, sample);
    aiSum += val.ai_confidence;
    aiN += 1;

    const ocr = req.ocr_confidence ?? 0.9;
    const ai = aiSum / aiN;
    const final_conf = Number((ocr * 0.4 + ai * 0.6).toFixed(3));

    await dbUpdate(id, {
      classification: undefined, // não existe coluna; mantemos em validation/extracted
      extracted_data: merged,
      validation: val.data,
      valid: val.data.valido,
      corrections: val.data.correcoes ?? [],
      ai_confidence: Number(ai.toFixed(3)),
      final_confidence: final_conf,
      progress: 100,
      status: "completed",
      duration_ms: Date.now() - startedAt,
    });

    // Persistência específica por classe (downstream)
    if (classe === "NFE_COMPRAS") {
      await persistNfeCompras({
        extraction_id: id,
        rma_id: req.rma_id,
        path: req.path,
        merged,
        confidence: final_conf,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("async pipeline failed:", msg);
    await dbUpdate(id, {
      status: "failed",
      error_message: msg,
      duration_ms: Date.now() - startedAt,
    });
  }
}

// ===== Handler =====
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET /ai-process?id=<uuid> — polling
  if (req.method === "GET") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ error: "id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const row = await dbGet(id);
    if (!row) {
      return new Response(JSON.stringify({ error: "não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        id: row.id,
        status: row.status,
        progress: row.progress ?? 0,
        chunks_processed: row.chunks_processed,
        chunks_total: row.chunks_total,
        classe: row.classe,
        agent: row.agent,
        ocr_conf: row.ocr_confidence,
        ai_conf: row.ai_confidence,
        final_conf: row.final_confidence,
        extracted_data: row.extracted_data,
        validation: row.validation,
        valid: row.valid,
        corrections: row.corrections,
        partial_results: row.partial_results,
        error_message: row.error_message,
        duration_ms: row.duration_ms,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // DELETE /ai-process?id=<uuid> — cancela job em andamento
  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ error: "id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const row = await dbGet(id);
    if (!row) {
      return new Response(JSON.stringify({ error: "não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (row.status === "completed" || row.status === "failed" || row.status === "canceled") {
      return new Response(
        JSON.stringify({
          id,
          status: row.status,
          message: `Job já está em estado terminal (${row.status})`,
          canceled: false,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    await dbUpdate(id, {
      status: "canceled",
      error_message: "Cancelado pelo usuário",
    });
    return new Response(
      JSON.stringify({
        id,
        status: "canceled",
        canceled: true,
        message: "Cancelamento solicitado. O worker interrompe entre chunks.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  let body: ProcessRequest;
  try {
    body = sanitizeProcessRequest(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.text || body.text.trim().length < 3) {
    return new Response(JSON.stringify({ error: "text é obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const isLong = body.text.length > ASYNC_CHAR_THRESHOLD;
  const explicitSync = body.async === false && body.text.length <= SYNC_CHAR_THRESHOLD;
  const useAsync = body.async === true || isLong || !explicitSync;

  // ===== ASSÍNCRONO =====
  if (useAsync) {
    const total = Math.ceil(body.text.length / CHUNK_SIZE);
    const created = await dbInsert({
      document_id: body.document_id ?? null,
      rma_id: body.rma_id ?? null,
      path: body.path ?? null,
      raw_text: body.text,
      normalized_text: body.normalized_text ?? null,
      ocr_confidence: body.ocr_confidence ?? null,
      status: "pending",
      progress: 0,
      chunks_processed: 0,
      chunks_total: total,
    });
    if (!created?.id) {
      return new Response(JSON.stringify({
        error: "Falha ao criar job",
        fallback: true,
        error_type: "JOB_CREATION_FAILED",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // @ts-ignore — EdgeRuntime existe no runtime Supabase
    EdgeRuntime.waitUntil(runPipelineAsync(created.id, body));

    const url = new URL(req.url);
    const pollUrl = `${url.origin}${url.pathname}?id=${created.id}`;

    return new Response(
      JSON.stringify({
        id: created.id,
        status: "pending",
        progress: 0,
        chunks_total: total,
        pollUrl,
        message: "Processamento iniciado em background. Use GET ?id= para acompanhar.",
      }),
      {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ===== SÍNCRONO =====
  try {
    const r = await runPipelineSingle(body);
    const persisted = await dbInsert({
      document_id: body.document_id ?? null,
      rma_id: body.rma_id ?? null,
      path: body.path ?? null,
      classe: r.classe,
      agent: r.agent,
      raw_text: body.text,
      normalized_text: body.normalized_text ?? null,
      ocr_confidence: r.ocr_conf,
      ai_confidence: r.ai_conf,
      final_confidence: r.final_conf,
      extracted_data: r.extracted,
      validation: r.validation,
      valid: r.validation.valido,
      corrections: r.validation.correcoes ?? [],
      status: "completed",
      progress: 100,
      chunks_total: 1,
      chunks_processed: 1,
      duration_ms: Date.now() - startedAt,
    });

    // Persistência específica por classe (downstream)
    if (r.classe === "NFE_COMPRAS" && persisted?.id) {
      await persistNfeCompras({
        extraction_id: persisted.id,
        rma_id: body.rma_id,
        path: body.path,
        merged: r.extracted,
        confidence: r.final_conf,
      });
    }

    return new Response(
      JSON.stringify({
        id: persisted?.id,
        status: "completed",
        progress: 100,
        classe: r.classe,
        agent: r.agent,
        data: r.extracted,
        classification: r.classification,
        validation: r.validation,
        validado: r.validation.valido,
        ocr_conf: r.ocr_conf,
        ai_conf: r.ai_conf,
        final_conf: r.final_conf,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ai-process sync error:", msg);
    await dbInsert({
      document_id: body.document_id ?? null,
      rma_id: body.rma_id ?? null,
      path: body.path ?? null,
      raw_text: body.text,
      normalized_text: body.normalized_text ?? null,
      ocr_confidence: body.ocr_confidence ?? null,
      status: "failed",
      progress: 0,
      error_message: msg,
      duration_ms: Date.now() - startedAt,
    });
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
