// Dynamic Context-Aware Prompt Builder per Company (RMA)
// MD: Prompt Dinâmico Context-Aware por Empresa
//
// Builds a prompt that adapts automatically to:
//   1. Company profile (segment, sector, preferred structure, language)
//   2. Historical memory (chart of accounts, account mapping cache, company facts)
//   3. Current document context (type, layout, OCR confidence, source)
//
// Hard rules embedded:
//   - NUNCA inventar dados (return null when missing)
//   - NUNCA inferir valores ausentes
//   - Manter consistência com histórico da empresa
//
// Usage:
//   const built = await buildDynamicPrompt({
//     companyId, documentType: "balancete",
//     extractedText, ocrConfidence: 0.9,
//     layoutDetected: "tabela", source: "onedrive",
//   });
//   const r = await callLLM({ system: built.system, prompt: built.prompt, useCache: true });

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ragRetrieve, ragContextsToPromptBlock, type RagHit } from "./rag-retriever.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface DynamicPromptInput {
  companyId: string;
  rmaId?: string;
  documentType: string;            // "balancete" | "dre" | "extrato" | ...
  extractedText: string;
  ocrConfidence?: number;          // 0..1
  layoutDetected?: string;         // "tabela" | "texto_corrido" | ...
  source?: string;                 // "onedrive" | "upload" | ...
  // Limits — keep prompt compact
  maxAccounts?: number;            // default 80
  maxPatterns?: number;            // default 40
  maxFacts?: number;               // default 12
  maxTextChars?: number;           // default 6000
  // RAG (vector memory) options
  enableRag?: boolean;             // default true
  ragTopK?: number;                // default dynamic (3..10)
  ragThreshold?: number;           // default 0.65
}

export interface DynamicPromptOutput {
  system: string;
  prompt: string;
  meta: {
    company: { id: string; name?: string; segment?: string };
    counts: { accounts: number; patterns: number; facts: number; rag: number };
    mode: "generic" | "enriched" | "conservative"; // adapts based on history & confidence
    recommendedModel: string;
    rag?: { topK: number; threshold: number; embedded: boolean; hits: RagHit[] };
  };
}

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

function safeJson(v: unknown, max = 2000): string {
  try {
    const s = JSON.stringify(v);
    return s.length > max ? s.slice(0, max) + "..." : s;
  } catch {
    return "[]";
  }
}

async function loadCompany(companyId: string) {
  const { data } = await sb()
    .from("companies")
    .select("id,name,sector,cnae,rma_id,execution_year,current_period_month")
    .eq("id", companyId)
    .maybeSingle();
  return data ?? null;
}

async function loadCompanyFacts(companyId: string, limit: number) {
  const { data } = await sb()
    .from("company_context")
    .select("chave,valor,scope,weight")
    .eq("company_id", companyId)
    .order("weight", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function loadChartOfAccounts(companyId: string, limit: number) {
  // Prefer company-specific; fallback to template
  const { data } = await sb()
    .from("chart_of_accounts")
    .select("conta,descricao,tipo,natureza,nivel")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("ordem", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (data && data.length > 0) return { accounts: data, source: "company" as const };

  const { data: tpl } = await sb()
    .from("chart_of_accounts")
    .select("conta,descricao,tipo,natureza,nivel")
    .is("company_id", null)
    .eq("is_template", true)
    .eq("active", true)
    .limit(limit);
  return { accounts: tpl ?? [], source: "template" as const };
}

async function loadAccountPatterns(companyId: string, limit: number) {
  const { data } = await sb()
    .from("account_mapping_cache")
    .select("descricao_normalizada,conta,descricao_padronizada,hits,confianca")
    .eq("company_id", companyId)
    .order("hits", { ascending: false })
    .limit(limit);
  return data ?? [];
}

function pickModel(historical: number, ocrConf: number, docType: string): { model: string; mode: DynamicPromptOutput["meta"]["mode"] } {
  // Custo-eficiência: padrão é flash-lite. Só escala quando há justificativa real
  // (OCR ruim OU documento contábil pesado com histórico denso).
  const LITE = "google/gemini-2.5-flash-lite";
  const FLASH = "google/gemini-2.5-flash";
  const PRO = "google/gemini-2.5-pro";

  // Conservative apenas quando OCR está realmente degradado (<0,5) → usa flash, não pro.
  if (ocrConf < 0.5) return { model: FLASH, mode: "conservative" };

  const heavy = ["balancete", "dre", "balanco", "fluxo_caixa"].some((k) =>
    docType.toLowerCase().includes(k),
  );

  // Pro só quando há histórico denso E o documento é estruturalmente complexo
  // E o OCR está abaixo de 0,75 (caso onde a ambiguidade compensa o custo).
  if (heavy && historical >= 20 && ocrConf < 0.75) {
    return { model: PRO, mode: "enriched" };
  }

  // Documentos pesados com bom OCR → flash (não pro).
  if (heavy && historical >= 10) return { model: FLASH, mode: "enriched" };

  // Tudo o mais (tópicos simples, extrações curtas) → flash-lite.
  return { model: LITE, mode: "generic" };
}

export async function buildDynamicPrompt(input: DynamicPromptInput): Promise<DynamicPromptOutput> {
  const maxAccounts = input.maxAccounts ?? 80;
  const maxPatterns = input.maxPatterns ?? 40;
  const maxFacts = input.maxFacts ?? 12;
  const maxText = input.maxTextChars ?? 6000;

  const enableRag = input.enableRag !== false;

  const [company, facts, coa, patterns, rag] = await Promise.all([
    loadCompany(input.companyId),
    loadCompanyFacts(input.companyId, maxFacts),
    loadChartOfAccounts(input.companyId, maxAccounts),
    loadAccountPatterns(input.companyId, maxPatterns),
    enableRag && input.extractedText
      ? ragRetrieve({
          companyId: input.companyId,
          text: input.extractedText.slice(0, 4000),
          topK: input.ragTopK,
          threshold: input.ragThreshold,
        }).catch((e) => {
          console.warn("[dynamic-prompt-builder] rag failed:", e);
          return { hits: [] as RagHit[], topK: 0, threshold: 0, embedded: false };
        })
      : Promise.resolve({ hits: [] as RagHit[], topK: 0, threshold: 0, embedded: false }),
  ]);

  const histCount = (coa.accounts.length || 0) + (patterns.length || 0) + (rag.hits.length || 0);
  const ocrConf = input.ocrConfidence ?? 0.85;
  const { model, mode } = pickModel(histCount, ocrConf, input.documentType);

  const system = [
    "Você é um Auditor Contábil Sênior IA, especialista em leitura e estruturação de documentos financeiros (balancete, DRE, extrato, balanço patrimonial) no padrão RMA.",
    "Sua precisão é absoluta. Você nunca inventa dados, nunca infere valores ausentes e mantém consistência com o histórico da empresa.",
    "Quando estiver em dúvida, retorne o campo como null e sinalize 'requires_review: true'.",
  ].join(" ");

  const sections: string[] = [];

  // 1. CONTEXTO DA EMPRESA
  sections.push(
    [
      "[CONTEXTO DA EMPRESA]",
      `- ID: ${company?.id ?? input.companyId}`,
      company?.name ? `- Nome: ${company.name}` : null,
      company?.sector ? `- Segmento: ${company.sector}` : null,
      company?.cnae ? `- CNAE: ${company.cnae}` : null,
      company?.execution_year ? `- Exercício: ${company.execution_year}` : null,
      company?.current_period_month ? `- Período corrente: mês ${company.current_period_month}` : null,
      `- Idioma: pt-BR`,
    ].filter(Boolean).join("\n"),
  );

  // 2. FATOS VALIDADOS DA EMPRESA
  if (facts.length > 0) {
    const lines = facts.map((f) => `- [${f.scope}] ${f.chave}: ${f.valor}`).join("\n");
    sections.push(`[FATOS VALIDADOS DA EMPRESA]\n${lines}`);
  }

  // 3. PLANO DE CONTAS
  if (coa.accounts.length > 0) {
    const lines = coa.accounts
      .map((a) => `${a.conta} | ${a.descricao} | ${a.tipo}${a.natureza ? "/" + a.natureza : ""}`)
      .join("\n");
    sections.push(
      `[PLANO DE CONTAS — fonte: ${coa.source} (${coa.accounts.length})]\nUSE EXCLUSIVAMENTE estas contas para mapeamento. Se não houver correspondência clara, retorne conta como null.\n${lines}`,
    );
  } else {
    sections.push(
      "[PLANO DE CONTAS]\nNenhum plano de contas cadastrado para esta empresa. Retorne contas como null e sinalize 'requires_review: true'.",
    );
  }

  // 4. PADRÕES HISTÓRICOS (account_mapping_cache)
  if (patterns.length > 0) {
    const lines = patterns
      .map((p) => `- "${p.descricao_normalizada}" → ${p.conta} (${p.descricao_padronizada}) [hits=${p.hits}, conf=${p.confianca}]`)
      .join("\n");
    sections.push(
      `[PADRÕES HISTÓRICOS DE MAPEAMENTO]\nMantenha consistência com o histórico abaixo (mesma descrição → mesma conta):\n${lines}`,
    );
  }

  // 4b. CONTEXTO RAG (memória vetorial — re-ranqueada)
  if (rag.hits.length > 0) {
    sections.push(ragContextsToPromptBlock(rag.hits));
  }


  sections.push(
    [
      "[CONTEXTO DO DOCUMENTO ATUAL]",
      `- Tipo: ${input.documentType}`,
      input.layoutDetected ? `- Layout detectado: ${input.layoutDetected}` : null,
      `- Confiança OCR: ${ocrConf.toFixed(2)}`,
      input.source ? `- Origem: ${input.source}` : null,
      `- Modo do prompt: ${mode}`,
    ].filter(Boolean).join("\n"),
  );

  // 6. REGRAS CRÍTICAS (anti-alucinação)
  sections.push(
    [
      "[REGRAS CRÍTICAS — INVIOLÁVEIS]",
      "- NUNCA inventar dados. Se a informação não estiver explicitamente presente no documento, retorne null.",
      "- NUNCA inferir valores ausentes. Não estime, não interpole, não complete.",
      "- NUNCA assumir estrutura que não está presente no texto extraído.",
      "- Manter consistência com o histórico: descrições já mapeadas devem usar a MESMA conta.",
      "- Preservar valores originais (BRL, 2 casas, separador decimal vírgula no input — converter para número JSON).",
      "- Datas em ISO (AAAA-MM-DD).",
      "- Se confiança individual < 0.7, marque 'requires_review: true' no item.",
      "- Se contiver 'Caixa' ou 'Bancos' → ATIVO CIRCULANTE (jamais receita).",
      "- Tarifas/IOF/juros pagos → DESPESA FINANCEIRA. Empréstimos → PASSIVO. Capital/reservas/lucros → PL.",
    ].join("\n"),
  );

  // 7. INSTRUÇÃO DE TAREFA + SCHEMA DE SAÍDA
  sections.push(
    [
      "[OBJETIVO]",
      `Interpretar o documento (${input.documentType}) e estruturá-lo no padrão RMA, mapeando cada item para o plano de contas fornecido.`,
      "",
      "[SAÍDA — JSON ESTRITO]",
      "{",
      '  "document_type": string,',
      '  "period": { "year": number|null, "month": number|null },',
      '  "accounts": [',
      "    {",
      '      "name_original": string,',
      '      "standard_name": string|null,',
      '      "conta": string|null,',
      '      "tipo": "ativo"|"passivo"|"pl"|"receita"|"despesa"|"custo"|null,',
      '      "valor": number|null,',
      '      "natureza": "debito"|"credito"|"saldo"|null,',
      '      "confidence": number,',
      '      "requires_review": boolean,',
      '      "justificativa": string',
      "    }",
      "  ],",
      '  "totals": { "ativo_total": number|null, "passivo_total": number|null, "pl": number|null, "receita_liquida": number|null, "lucro_liquido": number|null },',
      '  "consistency_warnings": string[]',
      "}",
      "",
      "Responda APENAS com o JSON, sem prefácio, sem markdown, sem comentários.",
    ].join("\n"),
  );

  // 8. INPUT
  const text = (input.extractedText ?? "").slice(0, maxText);
  sections.push(`[DADOS EXTRAÍDOS DO DOCUMENTO]\n${text}`);

  const prompt = sections.join("\n\n");

  return {
    system,
    prompt,
    meta: {
      company: { id: input.companyId, name: company?.name, segment: company?.sector },
      counts: { accounts: coa.accounts.length, patterns: patterns.length, facts: facts.length, rag: rag.hits.length },
      mode,
      recommendedModel: model,
      rag: { topK: rag.topK, threshold: rag.threshold, embedded: rag.embedded, hits: rag.hits },
    },
  };
}

// Convenience helper: build + call LLM with cache
export async function buildAndCall(input: DynamicPromptInput, callLLMFn: (opts: any) => Promise<any>) {
  const built = await buildDynamicPrompt(input);
  const result = await callLLMFn({
    system: built.system,
    prompt: built.prompt,
    model: built.meta.recommendedModel,
    useCache: true,
    temperature: 0.1,
  });
  return { built, result };
}
