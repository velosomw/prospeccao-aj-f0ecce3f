// rma-doc-section-regenerate
// Loop de revisão (CORE):
// - Lê comentários abertos da seção (feedback humano)
// - Carrega fontes reais: balancete_consolidado, rma_period_analyses, gráficos vinculados
// - Monta prompt grounded e chama Gemini via Lovable AI Gateway
// - Calcula grounding_score heurístico (cobertura numérica)
// - Registra fontes em rma_section_data_sources
// - Salva nova versão em rma_document_section_versions
// - Atualiza seção (conteudo_ia, regen_count, grounding_score, ungrounded_claims)
//
// Body (POST): { section_id: string, extra_instructions?: string, author_id?: string }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function sb<T = any>(path: string, init: RequestInit = {}): Promise<T> {
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
  if (!res.ok) throw new Error(`supabase ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPeriodo = (a: number, m: number) =>
  `${String(m).padStart(2, "0")}-${a}`;

const SYSTEM_PROMPT = `Você é "Auditor Contábil Sênior IA", especializado em Recuperação Judicial e Recomendação CNJ 72/2020.

REGRAS CRÍTICAS DE GOVERNANÇA (NÃO VIOLAR):
1. NUNCA invente números, datas, nomes ou eventos. Use APENAS os dados listados em [DADOS REAIS].
2. Se faltar dado para uma afirmação, escreva explicitamente "Não há informação disponível para o período X" — não preencha com estimativas.
3. Toda divergência ou inconsistência detectada deve ser apontada de forma clara, com os valores envolvidos.
4. Cite o período (MM-AAAA) sempre que mencionar um valor.
5. Linguagem: técnica jurídico-contábil, formal, impessoal, parágrafos curtos. Sem markdown headers, sem bullets.
6. Considere o feedback humano em [REVISÕES PENDENTES] como prioridade — ele indica o que deve ser corrigido na nova versão.`;

interface FonteRegistro {
  source_type: string;
  source_table?: string;
  source_id?: string | null;
  company_id?: string | null;
  ano?: number | null;
  mes?: number | null;
  periodo_label?: string | null;
  trecho?: string;
  metadata?: any;
}

async function callGemini(userPrompt: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Reduzido de gemini-2.5-flash para flash-lite — economia ~5x por chamada.
      // Tópicos pequenos de seção raramente exigem o modelo maior.
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return {
    content: (data?.choices?.[0]?.message?.content as string) ?? "",
    usage: data?.usage ?? {},
  };
}

// Heurística de grounding: extrai números do texto e verifica quantos batem
// (com tolerância) com algum valor monetário das fontes.
function calcGrounding(content: string, sourceNumbers: number[]): {
  score: number;
  ungrounded: string[];
} {
  const matches = content.match(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g) || [];
  const nums = matches
    .map((m) => Number(m.replace(/\./g, "").replace(",", ".")))
    .filter((n) => !Number.isNaN(n) && Math.abs(n) >= 100); // ignora pequenos
  if (nums.length === 0) return { score: 80, ungrounded: [] }; // texto sem números → grounding moderado
  const tol = 0.02; // 2%
  const ungrounded: string[] = [];
  let ok = 0;
  for (const n of nums) {
    const found = sourceNumbers.some(
      (s) => s !== 0 && Math.abs((n - s) / s) <= tol,
    );
    if (found) ok++;
    else ungrounded.push(String(n));
  }
  const score = Math.round((ok / nums.length) * 100);
  return { score, ungrounded: ungrounded.slice(0, 20) };
}

// Cache em memória por invocação: evita refetch de balancete/análises quando
// várias seções da mesma empresa são regeneradas no mesmo request.
const companyDataCache = new Map<string, { balRows: any[]; analyses: any[] }>();

async function processSection(
  section_id: string,
  extra_instructions: string,
  author_id: string | null,
) {
    // 1) Seção + documento + empresa
    const sec = (await sb<any[]>(`rma_document_sections?id=eq.${section_id}&select=*`))[0];
    if (!sec) throw new Error("seção não encontrada");
    const doc = (await sb<any[]>(`rma_documents?id=eq.${sec.document_id}&select=*`))[0];
    if (!doc) throw new Error("documento não encontrado");
    const company = (await sb<any[]>(
      `companies?rma_id=eq.${encodeURIComponent(doc.rma_id)}&select=id,name&limit=1`,
    ))[0];
    if (!company) throw new Error("empresa não encontrada");

    // 2) Comentários abertos (feedback)
    const comments = await sb<any[]>(
      `rma_document_section_comments?section_id=eq.${section_id}&select=comentario,created_at,author_id&order=created_at.desc&limit=10`,
    ).catch(() => []);
    const feedback = (comments || [])
      .map((c: any) => `- ${c.comentario}`)
      .join("\n");

    // 3) Fontes (cacheadas por empresa nesta invocação)
    let cached = companyDataCache.get(company.id);
    if (!cached) {
      const [balRows, analyses] = await Promise.all([
        sb<any[]>(
          `balancete_consolidado?company_id=eq.${company.id}&select=ano,mes,grupo,tipo,valor,conta,descricao&order=ano.desc,mes.desc&limit=2000`,
        ),
        sb<any[]>(
          `rma_period_analyses?company_id=eq.${company.id}&select=year,month,period_label,indicadores,kanitz,score_rj,diagnostico&order=year.desc,month.desc&limit=6`,
        ),
      ]);
      cached = { balRows, analyses };
      companyDataCache.set(company.id, cached);
    }
    const balRows = cached.balRows;
    const analyses = cached.analyses;

    const periodMap = new Map<string, any[]>();
    for (const r of balRows) {
      const k = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
      if (!periodMap.has(k)) periodMap.set(k, []);
      periodMap.get(k)!.push(r);
    }
    const periodKeys = Array.from(periodMap.keys()).sort().slice(-6);



    // 4) Gráficos vinculados (chart_meta da seção)
    const chartIds: string[] = Array.isArray(sec.graficos_ids) ? sec.graficos_ids : [];
    const charts = chartIds.length
      ? await sb<any[]>(
          `rma_document_charts?id=in.(${chartIds.join(",")})&select=id,tipo,titulo,descricao_ia,dados,fonte`,
        )
      : [];

    // 5) Monta bloco [DADOS REAIS] e coleciona números p/ grounding
    const fontes: FonteRegistro[] = [];
    const sourceNumbers: number[] = [];
    const blocosBalancete: string[] = [];

    for (const k of periodKeys) {
      const [y, m] = k.split("-").map(Number);
      const rows = periodMap.get(k) || [];
      const totals: Record<string, number> = {};
      for (const r of rows) {
        const g = String(r.grupo || r.tipo || "outros").toUpperCase();
        totals[g] = (totals[g] || 0) + Number(r.valor || 0);
      }
      const linhas: string[] = [];
      for (const [g, v] of Object.entries(totals)) {
        linhas.push(`  ${g}: ${fmtBRL(v)}`);
        sourceNumbers.push(Math.abs(v));
      }
      blocosBalancete.push(`Período ${fmtPeriodo(y, m)}:\n${linhas.join("\n")}`);
      fontes.push({
        source_type: "balancete_consolidado",
        source_table: "balancete_consolidado",
        company_id: company.id,
        ano: y,
        mes: m,
        periodo_label: fmtPeriodo(y, m),
        trecho: linhas.join(" | ").slice(0, 500),
        metadata: { totals },
      });
    }

    const blocosAnalise: string[] = [];
    for (const a of analyses) {
      const parts: string[] = [];
      if (a.kanitz?.fi != null) {
        parts.push(`Kanitz FI = ${a.kanitz.fi}`);
        sourceNumbers.push(Number(a.kanitz.fi));
      }
      if (a.score_rj?.score != null) {
        parts.push(`BEx-RJ Score = ${a.score_rj.score}`);
        sourceNumbers.push(Number(a.score_rj.score));
      }
      if (a.indicadores) {
        for (const [k2, v] of Object.entries(a.indicadores)) {
          if (typeof v === "number") {
            parts.push(`${k2} = ${v}`);
            sourceNumbers.push(Number(v));
          }
        }
      }
      if (parts.length) {
        blocosAnalise.push(`Período ${a.period_label}: ${parts.join("; ")}`);
        fontes.push({
          source_type: "period_analysis",
          source_table: "rma_period_analyses",
          company_id: company.id,
          ano: a.year,
          mes: a.month,
          periodo_label: a.period_label,
          trecho: parts.join("; ").slice(0, 500),
        });
      }
    }

    const blocosGraficos: string[] = [];
    for (const c of charts) {
      blocosGraficos.push(`Gráfico "${c.titulo}" (${c.tipo}): ${c.descricao_ia || ""}`);
      fontes.push({
        source_type: "chart",
        source_table: "rma_document_charts",
        source_id: c.id,
        company_id: company.id,
        trecho: c.titulo,
        metadata: { tipo: c.tipo },
      });
      // alimenta números do gráfico ao pool de grounding
      try {
        const series = c?.dados?.series || [];
        for (const pt of series) {
          for (const v of Object.values(pt)) {
            if (typeof v === "number") sourceNumbers.push(Math.abs(v));
          }
        }
      } catch { /* noop */ }
    }

    // 6) Prompt grounded
    const userPrompt = `
DOCUMENTO: ${doc.titulo} (tipo: ${doc.tipo})
EMPRESA: ${company.name}
SEÇÃO ALVO: ${sec.numero ?? ""} ${sec.titulo}

INSTRUÇÃO ESPECÍFICA DA SEÇÃO:
${sec.prompt_contexto || "Redija o conteúdo técnico desta seção conforme o título."}

[REVISÕES PENDENTES] (feedback humano — corrigir/incorporar):
${feedback || "(sem comentários abertos)"}

${extra_instructions ? `[INSTRUÇÃO ADICIONAL DO USUÁRIO]\n${extra_instructions}\n` : ""}

[DADOS REAIS — BALANCETE CONSOLIDADO]
${blocosBalancete.join("\n\n") || "(sem balancete consolidado disponível)"}

[DADOS REAIS — INDICADORES E ANÁLISES POR PERÍODO]
${blocosAnalise.join("\n") || "(sem indicadores calculados)"}

[GRÁFICOS VINCULADOS A ESTA SEÇÃO]
${blocosGraficos.join("\n") || "(nenhum gráfico vinculado)"}

[VERSÃO ATUAL DA SEÇÃO]
${sec.conteudo_editado || sec.conteudo_ia || "(seção ainda não redigida)"}

Tarefa: REGERE a seção corrigindo o que o feedback aponta, ancorando 100% das afirmações numéricas em [DADOS REAIS]. Onde faltar dado, declare a ausência. Aponte divergências com clareza.`.trim();

    const { content, usage } = await callGemini(userPrompt);

    // 7) Grounding heurístico
    const { score, ungrounded } = calcGrounding(content, sourceNumbers);

    // 8) Persiste versão + atualiza seção
    const novaVersao = (sec.versao_atual || 1) + 1;
    await sb("rma_document_section_versions", {
      method: "POST",
      body: JSON.stringify([
        {
          section_id,
          versao: novaVersao,
          conteudo: content,
          origem: "ia_refeito",
          acao: "regenerate_with_feedback",
          motivo: extra_instructions || (feedback ? "regen com feedback" : "regen"),
          author_id,
          metadata: { usage, grounding_score: score, comments_count: comments?.length || 0 },
        },
      ]),
    });

    await sb(`rma_document_sections?id=eq.${section_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        conteudo_ia: content,
        versao_atual: novaVersao,
        status: sec.status === "pendente" ? "em_edicao" : sec.status,
        regen_count: (sec.regen_count || 0) + 1,
        grounding_score: score,
        ungrounded_claims: ungrounded,
        tokens_usados: (sec.tokens_usados || 0) + (usage?.total_tokens || 0),
        updated_by: author_id,
      }),
    });

    // 9) Limpa fontes anteriores e registra novas
    await sb(`rma_section_data_sources?section_id=eq.${section_id}`, { method: "DELETE" });
    if (fontes.length) {
      await sb("rma_section_data_sources", {
        method: "POST",
        body: JSON.stringify(
          fontes.map((f) => ({
            section_id,
            document_id: sec.document_id,
            ...f,
            created_by: author_id,
          })),
        ),
      });
    }

    return {
      ok: true,
      section_id,
      versao: novaVersao,
      grounding_score: score,
      ungrounded_count: ungrounded.length,
      sources_count: fontes.length,
      comments_used: comments?.length || 0,
      usage,
    };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const { section_id, section_ids, extra_instructions = "", author_id = null } = body || {};

    // Modo batch: agrupa N seções em UMA invocação, reusando dados da empresa.
    const ids: string[] = Array.isArray(section_ids) && section_ids.length
      ? section_ids
      : (section_id ? [section_id] : []);
    if (ids.length === 0) throw new Error("section_id ou section_ids obrigatório");

    companyDataCache.clear();
    const results: any[] = [];
    for (const id of ids) {
      try {
        const r = await processSection(id, extra_instructions, author_id);
        results.push(r);
      } catch (e: any) {
        results.push({ ok: false, section_id: id, error: String(e?.message || e) });
      }
    }

    // Compat: se chamado com section_id único, devolve o objeto direto.
    if (!Array.isArray(section_ids)) {
      const single = results[0];
      const status = single?.ok ? 200 : 500;
      return new Response(JSON.stringify(single), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        count: results.length,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[rma-doc-section-regenerate]", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

