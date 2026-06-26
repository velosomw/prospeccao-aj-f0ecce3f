// rma-doc-section-ai
// Gera (modo "generate") ou refaz (modo "rewrite") o conteúdo de uma seção
// usando Lovable AI Gateway (Gemini). Persiste em rma_document_sections + versão.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const SYSTEM_PROMPT_BASE = `REGRAS CRÍTICAS COMUNS:
- NUNCA inventar números, datas ou nomes. Use apenas dados fornecidos no contexto.
- Linguagem formal, impessoal, técnica.
- Comparações interanuais com percentuais quando houver dados.
- Interpretação crítica, não apenas descrição.
- Coerência entre seções (não contradizer dados de outras seções enviadas como contexto).
- Saída em prosa contínua, parágrafos curtos. Sem markdown headers, sem bullets.`;

const SYSTEM_PROMPT_BY_TIPO: Record<string, string> = {
  parecer_tecnico: `Você é "Auditor Contábil Sênior IA", redator de PARECER TÉCNICO CONTÁBIL em processo de Recuperação Judicial.
Objetivo do documento: emitir opinião técnica fundamentada sobre a fidedignidade dos demonstrativos, a aderência ao Plano de Recuperação e os riscos contábeis identificados.
Estilo: parecer pericial — tese, fundamentação, conclusão por seção. Termina com convicção técnica.
${SYSTEM_PROMPT_BASE}`,
  rma_mensal: `Você é "Auditor Contábil Sênior IA", redator do RELATÓRIO MENSAL DE ATIVIDADES (RMA) conforme Recomendação CNJ 72/2020.
Objetivo do documento: relatar de forma cronológica e objetiva os atos da Administração Judicial no mês, evolução do plano, fluxo de caixa, créditos e ocorrências relevantes.
Estilo: relatório de acompanhamento — descritivo, sequencial, com indicadores e fatos do período. Não emite opinião pericial; relata e contextualiza.
${SYSTEM_PROMPT_BASE}`,
  rma_mensal_dip: `Você é "Auditor Contábil Sênior IA", redator do RELATÓRIO MENSAL DE ATIVIDADES – RMA da Administradora Judicial (modelo DIP/Capital AJ).
Mantenha estrutura institucional, linguagem jurídica formal, base legal Lei 11.101/2005 e Recomendação CNJ 72/2020.
${SYSTEM_PROMPT_BASE}`,
  rma_intelligence: `Você é "Auditor Contábil Sênior IA", motor do RMA REPORT INTELLIGENCE ENGINE (v3).
Cada seção do relatório obrigatoriamente possui 5 blocos consecutivos, nesta ordem e com estes títulos exatos:
1) "Dados extraídos" — síntese factual dos dados (balancete, DRE, fluxo, folha, fiscal, NF-e etc.).
2) "Evidências" — origem dos dados (documento, página, data, confiança); cite explicitamente.
3) "Validação" — status (conciliado / não conciliado / divergência / pendência / inconsistência).
4) "Análise Técnica IA" — interpretação crítica baseada em evidências (variações, causas, comparativo histórico).
5) "Conclusão IA" — Status, Risco (baixo/médio/alto/muito_alto), Impacto, Recomendação.
Nunca use linguagem genérica; nunca invente números. Se não houver dado, declare "dado não disponível no período".
${SYSTEM_PROMPT_BASE}`,
};

function systemPromptFor(tipo: string) {
  return SYSTEM_PROMPT_BY_TIPO[tipo] || SYSTEM_PROMPT_BY_TIPO.parecer_tecnico;
}

async function callGemini(userPrompt: string, systemPrompt: string, model = "google/gemini-2.5-flash") {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
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
      temperature: 0.4,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`AI gateway ${r.status}: ${txt}`);
  }
  const data = await r.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const usage = data?.usage ?? {};
  try {
    const { logGatewayUsage } = await import("../_shared/ai-telemetry.ts");
    logGatewayUsage(data, { model, type: "generation", metadata: { fn: "rma-doc-section-ai" } }).catch(() => {});
  } catch (_) { /* noop */ }
  return { content, usage };
}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`supabase ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      section_id,
      mode = "generate", // "generate" | "rewrite"
      extra_instructions = "",
      author_id = null,
    } = body || {};

    if (!section_id) {
      return new Response(JSON.stringify({ error: "section_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega seção
    const sections = await sb(
      `rma_document_sections?id=eq.${section_id}&select=*`,
    );
    const section = sections?.[0];
    if (!section) throw new Error("Seção não encontrada");

    // Carrega documento + outras seções (contexto)
    const docs = await sb(
      `rma_documents?id=eq.${section.document_id}&select=*`,
    );
    const doc = docs[0];

    const siblings = await sb(
      `rma_document_sections?document_id=eq.${section.document_id}&select=numero,titulo,conteudo_editado,conteudo_ia,status&order=ordem.asc`,
    );

    const contextoSecoes = (siblings || [])
      .filter((s: any) => s.id !== section_id && (s.conteudo_editado || s.conteudo_ia))
      .slice(0, 8)
      .map(
        (s: any) =>
          `### ${s.numero ?? ""} ${s.titulo}\n${(s.conteudo_editado || s.conteudo_ia || "").slice(0, 600)}`,
      )
      .join("\n\n");

    const userPrompt = `
DOCUMENTO: ${doc.titulo} (tipo: ${doc.tipo})
RMA_ID: ${doc.rma_id}

SEÇÃO ALVO: ${section.numero ?? ""} ${section.titulo}

INSTRUÇÃO ESPECÍFICA DA SEÇÃO:
${section.prompt_contexto || "Redija o conteúdo técnico desta seção conforme o título."}

${extra_instructions ? `INSTRUÇÃO ADICIONAL DO USUÁRIO:\n${extra_instructions}\n` : ""}

CONTEXTO (resumo de outras seções do mesmo documento):
${contextoSecoes || "(nenhuma outra seção redigida ainda)"}

${mode === "rewrite" && (section.conteudo_editado || section.conteudo_ia) ? `VERSÃO ATUAL (refaça mantendo coerência, melhorando clareza, profundidade analítica e tecnicalidade):\n${section.conteudo_editado || section.conteudo_ia}` : ""}

${doc.tipo === "rma_intelligence"
  ? "Redija agora esta seção do RMA REPORT INTELLIGENCE ENGINE com os 5 blocos obrigatórios (Dados extraídos, Evidências, Validação, Análise Técnica IA, Conclusão IA) — cada um precedido pelo título exato e separado por linha em branco. Não use markdown."
  : doc.tipo === "rma_mensal_dip"
    ? "Redija agora esta seção do RMA da Administradora Judicial (modelo DIP/Capital AJ), em linguagem institucional formal."
    : doc.tipo === "rma_mensal"
      ? "Redija agora esta seção como parte do RELATÓRIO MENSAL DE ATIVIDADES (CNJ 72/2020): texto descritivo, cronológico e factual do período, sem opinião pericial."
      : "Redija agora esta seção como parte do PARECER TÉCNICO CONTÁBIL: tese, fundamentação e conclusão técnica fundamentada."}
`.trim();

    const { content, usage } = await callGemini(userPrompt, systemPromptFor(doc.tipo));

    const novaVersao = (section.versao_atual || 1) + (mode === "rewrite" ? 1 : 0);

    // Upsert versão
    await sb("rma_document_section_versions", {
      method: "POST",
      body: JSON.stringify([
        {
          section_id,
          versao: novaVersao,
          conteudo: content,
          origem: mode === "rewrite" ? "ia_refeito" : "ia_inicial",
          motivo: extra_instructions || null,
          author_id,
          metadata: { usage },
        },
      ]),
    });

    // Atualiza seção
    await sb(`rma_document_sections?id=eq.${section_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        conteudo_ia: content,
        versao_atual: novaVersao,
        status: section.status === "pendente" ? "em_edicao" : section.status,
        tokens_usados:
          (section.tokens_usados || 0) + (usage?.total_tokens || 0),
        updated_by: author_id,
      }),
    });

    return new Response(
      JSON.stringify({ ok: true, content, versao: novaVersao, usage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("rma-doc-section-ai error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
