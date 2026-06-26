// prompt-builder — MD: Prompt Builder Inteligente (Auto-Ajuste da IA RMA)
// Camada complementar (opt-in). NÃO substitui ai-process; é consumida por pipelines como balancete-build.
//
// Endpoints:
//   POST /prompt-builder
//     body: {
//       classe: string,                  // ex: "balancete", "extrato", "dre"
//       input_text: string,              // texto OCR/normalizado a interpretar
//       contexto?: {                     // opcional, enriquece prompt
//         tipo_documento?: string,
//         empresa?: string,
//         periodo?: string,
//         estrutura_esperada?: string
//       },
//       company_id?: string,
//       rma_id?: string,
//       document_id?: string,
//       version?: string,                // default "v1"
//       persist?: boolean                // grava em prompt_versions (default true)
//     }
//     resp: { prompt: string, components: {...}, prompt_hash: string, tokens_estimated: number }
//
//   POST /prompt-builder?action=feedback
//     body: { entrada_texto, classificacao_correta, conta?, tipo?, classe?, origem?, company_id? }
//     → upsert prompt_learning (incrementa frequência se já existir)
//
//   POST /prompt-builder?action=erro
//     body: { erro, correcao, classe?, impacto? }
//     → upsert prompt_erros (incrementa frequência)
//
//   GET  /prompt-builder?action=preview&classe=balancete&input_text=...
//     → mesmo retorno do POST (sem persistir).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ============= Utils =============
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function estimateTokens(s: string): number {
  // Aprox: 1 token ~ 4 chars (pt-br).
  return Math.ceil((s || "").length / 4);
}

// ============= Componentes =============
function getPromptBase(): string {
  return [
    "Você é um Auditor Contábil Sênior IA, especialista em reconstrução de balancetes a partir de documentos financeiros diversos (balancete, DRE, extrato, NFs, contratos).",
    "",
    "Sua missão:",
    "- Extrair dados com precisão (valores, datas, partes, contas).",
    "- Classificar corretamente no plano de contas brasileiro (CPC/BR-GAAP).",
    "- Garantir consistência contábil (Ativo = Passivo + PL; receita ≥ 0; despesa reduz resultado).",
    "- Devolver respostas estruturadas em JSON quando solicitado.",
  ].join("\n");
}

function getRegrasContabeis(): string {
  return [
    "REGRAS CONTÁBEIS ESTRUTURAIS (invioláveis):",
    "- Ativo = Passivo + Patrimônio Líquido (tolerância 0,1%).",
    "- Receita nunca é negativa; estornos lançar como dedução de receita.",
    "- Despesa sempre reduz resultado; não confundir com Custo (CMV/CSP).",
    "- Caixa/Bancos são ATIVO CIRCULANTE — nunca classifique como receita.",
    "- Tarifas bancárias, IOF, juros pagos = DESPESA FINANCEIRA.",
    "- Empréstimos/Financiamentos = PASSIVO (curto/longo prazo).",
    "- Capital social, reservas, lucros acumulados = PATRIMÔNIO LÍQUIDO.",
    "- Datas no formato ISO (AAAA-MM-DD). Valores em BRL com 2 casas.",
  ].join("\n");
}

function getContexto(ctx?: Record<string, string | undefined>): string {
  if (!ctx) return "";
  const lines = ["CONTEXTO DO DOCUMENTO:"];
  if (ctx.tipo_documento) lines.push(`- Tipo: ${ctx.tipo_documento}`);
  if (ctx.empresa) lines.push(`- Empresa: ${ctx.empresa}`);
  if (ctx.periodo) lines.push(`- Período: ${ctx.periodo}`);
  if (ctx.estrutura_esperada) lines.push(`- Estrutura esperada: ${ctx.estrutura_esperada}`);
  return lines.length > 1 ? lines.join("\n") : "";
}

async function getErrosRecorrentes(classe: string, limit = 8): Promise<string> {
  const { data } = await supabase
    .from("prompt_erros")
    .select("erro, correcao, impacto, frequencia")
    .eq("classe", classe)
    .eq("active", true)
    .order("impacto", { ascending: false })
    .order("frequencia", { ascending: false })
    .limit(limit);
  if (!data || data.length === 0) return "";
  const lines = ["ERROS RECORRENTES (NÃO REPITA):"];
  for (const e of data) {
    lines.push(`- ❌ ${e.erro}  →  ✅ ${e.correcao}  [impacto: ${e.impacto}, freq: ${e.frequencia}]`);
  }
  return lines.join("\n");
}

async function getAprendizado(classe: string, inputNorm: string, limit = 6): Promise<string> {
  // Heurística simples: pega top frequência da classe + matches por substring.
  const { data: top } = await supabase
    .from("prompt_learning")
    .select("entrada_texto, classificacao_correta, conta, frequencia")
    .eq("classe", classe)
    .eq("active", true)
    .order("frequencia", { ascending: false })
    .limit(limit);

  // matches por substring (lado servidor: filtramos no cliente para evitar ILIKE pesado)
  const tokens = inputNorm.split(" ").filter((t) => t.length >= 4).slice(0, 5);
  let matches: any[] = [];
  if (tokens.length > 0) {
    const ors = tokens.map((t) => `entrada_normalizada.ilike.%${t}%`).join(",");
    const { data: m } = await supabase
      .from("prompt_learning")
      .select("entrada_texto, classificacao_correta, conta, frequencia")
      .eq("classe", classe)
      .eq("active", true)
      .or(ors)
      .order("frequencia", { ascending: false })
      .limit(limit);
    matches = m || [];
  }

  const all = [...(matches || []), ...(top || [])];
  // dedupe por entrada+conta
  const seen = new Set<string>();
  const dedup = all.filter((r) => {
    const k = `${r.entrada_texto}::${r.conta || ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);

  if (dedup.length === 0) return "";
  const lines = ["EXEMPLOS APRENDIDOS (use como padrão):"];
  for (const r of dedup) {
    const conta = r.conta ? ` → conta ${r.conta}` : "";
    lines.push(`- "${r.entrada_texto}" → ${r.classificacao_correta}${conta}`);
  }
  return lines.join("\n");
}

function getInstrucaoFinal(classe: string): string {
  return [
    "TAREFA:",
    `Analise o conteúdo abaixo (classe: ${classe}) e produza a extração estruturada.`,
    "Para cada item identificado, forneça: descrição original, conta sugerida, tipo (debito/credito/saldo), valor e justificativa breve.",
    "Quando houver ambiguidade, prefira a hipótese alinhada às regras estruturais e exemplos aprendidos.",
    "Se a confiança individual for < 0,7, sinalize para revisão humana.",
  ].join("\n");
}

// ============= Build =============
async function buildPrompt(params: {
  classe: string;
  input_text: string;
  contexto?: Record<string, string | undefined>;
}): Promise<{ prompt: string; components: Record<string, string>; tokens_estimated: number; prompt_hash: string }> {
  const { classe, input_text, contexto } = params;
  const inputNorm = normalize(input_text);

  const base = getPromptBase();
  const ctx = getContexto(contexto);
  const regras = getRegrasContabeis();
  const erros = await getErrosRecorrentes(classe);
  const exemplos = await getAprendizado(classe, inputNorm);
  const tarefa = getInstrucaoFinal(classe);

  const sections = [base, ctx, regras, erros, exemplos, tarefa, "CONTEÚDO:", input_text]
    .filter((s) => s && s.trim().length > 0);
  const prompt = sections.join("\n\n");
  const components = { base, contexto: ctx, regras, erros, exemplos, tarefa };
  const prompt_hash = await sha256(prompt);
  return { prompt, components, tokens_estimated: estimateTokens(prompt), prompt_hash };
}

async function persistVersion(args: {
  classe: string;
  version: string;
  prompt: string;
  components: Record<string, string>;
  prompt_hash: string;
  tokens_estimated: number;
  document_id?: string;
  rma_id?: string;
  company_id?: string;
}) {
  // Reaproveita versão se hash já existe (incrementa used_count).
  const { data: exists } = await supabase
    .from("prompt_versions")
    .select("id, used_count")
    .eq("prompt_hash", args.prompt_hash)
    .maybeSingle();
  if (exists?.id) {
    await supabase
      .from("prompt_versions")
      .update({ used_count: (exists.used_count || 0) + 1 })
      .eq("id", exists.id);
    return exists.id as string;
  }
  const { data, error } = await supabase
    .from("prompt_versions")
    .insert({
      classe: args.classe,
      version: args.version,
      document_id: args.document_id || null,
      rma_id: args.rma_id || null,
      company_id: args.company_id || null,
      prompt_final: args.prompt,
      components: args.components,
      prompt_hash: args.prompt_hash,
      tokens_estimated: args.tokens_estimated,
      used_count: 1,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// ============= Feedback handlers =============
async function recordLearning(body: any) {
  const entrada = String(body.entrada_texto || "").trim();
  if (!entrada) throw new Error("entrada_texto required");
  const classe = body.classe || "balancete";
  const conta = body.conta || null;
  const norm = normalize(entrada);

  const { data: existing } = await supabase
    .from("prompt_learning")
    .select("id, frequencia")
    .eq("classe", classe)
    .eq("entrada_normalizada", norm)
    .eq("conta", conta)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("prompt_learning")
      .update({ frequencia: (existing.frequencia || 1) + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { id: existing.id, action: "incremented" };
  }
  const { data, error } = await supabase
    .from("prompt_learning")
    .insert({
      classe,
      entrada_texto: entrada,
      entrada_normalizada: norm,
      classificacao_correta: body.classificacao_correta,
      conta,
      tipo: body.tipo || null,
      origem: body.origem || "usuario",
      confianca: body.confianca ?? 0.9,
      company_id: body.company_id || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, action: "inserted" };
}

async function recordErro(body: any) {
  const erro = String(body.erro || "").trim();
  if (!erro) throw new Error("erro required");
  const classe = body.classe || "balancete";

  const { data: existing } = await supabase
    .from("prompt_erros")
    .select("id, frequencia")
    .eq("classe", classe)
    .eq("erro", erro)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("prompt_erros")
      .update({
        frequencia: (existing.frequencia || 1) + 1,
        last_seen_at: new Date().toISOString(),
        correcao: body.correcao ?? undefined,
        impacto: body.impacto ?? undefined,
      })
      .eq("id", existing.id);
    return { id: existing.id, action: "incremented" };
  }
  const { data, error } = await supabase
    .from("prompt_erros")
    .insert({
      classe,
      erro,
      correcao: body.correcao || "",
      impacto: body.impacto || "medium",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, action: "inserted" };
}

// ============= HTTP =============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "build";

    if (req.method === "GET" && action === "preview") {
      const classe = url.searchParams.get("classe") || "balancete";
      const input_text = url.searchParams.get("input_text") || "";
      const out = await buildPrompt({ classe, input_text });
      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));

    if (action === "feedback") {
      const r = await recordLearning(body);
      return new Response(JSON.stringify({ ok: true, ...r }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "erro") {
      const r = await recordErro(body);
      return new Response(JSON.stringify({ ok: true, ...r }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // default: build
    const classe = String(body.classe || "balancete");
    const input_text = String(body.input_text || "");
    if (!input_text.trim()) {
      return new Response(JSON.stringify({ error: "input_text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const out = await buildPrompt({ classe, input_text, contexto: body.contexto });
    let version_id: string | null = null;
    if (body.persist !== false) {
      version_id = await persistVersion({
        classe,
        version: body.version || "v1",
        prompt: out.prompt,
        components: out.components,
        prompt_hash: out.prompt_hash,
        tokens_estimated: out.tokens_estimated,
        document_id: body.document_id,
        rma_id: body.rma_id,
        company_id: body.company_id,
      });
    }
    return new Response(JSON.stringify({ ...out, version_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("prompt-builder error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
