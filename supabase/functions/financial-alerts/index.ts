// Fase 7 — Alertas e insights financeiros automáticos
// Combina regras determinísticas + análise por IA (Lovable AI Gateway).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BSRow { ano: number; mes: number; secao: string; grupo: string | null; nivel: number; valor: number; descricao: string; codigo: string }
interface DRERow { ano: number; mes: number; grupo: string | null; valor: number; descricao: string }

const monthLabel = (a: number, m: number) =>
  new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

function calcKPIs(bs: BSRow[], dre: DRERow[]) {
  const sumBy = (sec: string, grupo?: string) =>
    bs.filter(r => r.secao === sec && (!grupo || r.grupo === grupo) && r.nivel <= 3)
      .reduce((s, r) => s + Number(r.valor || 0), 0);
  const ac = sumBy("ativo", "circulante");
  const anc = sumBy("ativo", "nao_circulante");
  const at = ac + anc;
  const pc = sumBy("passivo", "circulante");
  const pnc = sumBy("passivo", "nao_circulante");
  const pt = pc + pnc;
  const pl = sumBy("pl");
  const sumDre = (cat: string) =>
    dre.filter(r => r.grupo === cat).reduce((s, r) => s + Number(r.valor || 0), 0);
  const receita = Math.abs(sumDre("receita_bruta")) - Math.abs(sumDre("deducoes"));
  const custos = Math.abs(sumDre("custos"));
  const desp = Math.abs(sumDre("despesas_operacionais"));
  const lucroBruto = receita - custos;
  const ebitda = lucroBruto - desp;
  const result = ebitda - Math.abs(sumDre("depreciacao")) - Math.abs(sumDre("amortizacao"))
    + sumDre("resultado_financeiro") - Math.abs(sumDre("impostos"));
  return {
    ac, anc, at, pc, pnc, pt, pl, receita, custos, desp, lucroBruto, ebitda, result,
    liquidez_corrente: pc > 0 ? ac / pc : null,
    endividamento: at > 0 ? pt / at : null,
    margem_ebitda: receita > 0 ? ebitda / receita : null,
    margem_liquida: receita > 0 ? result / receita : null,
    capital_giro: ac - pc,
  };
}

function ruleAlerts(serie: { ano: number; mes: number; k: ReturnType<typeof calcKPIs> }[]) {
  const out: any[] = [];
  if (!serie.length) return out;
  const last = serie[serie.length - 1];
  const prev = serie[serie.length - 2];
  const periodo = monthLabel(last.ano, last.mes);

  if (last.k.liquidez_corrente != null && last.k.liquidez_corrente < 1) {
    out.push({
      severidade: "bad", origem: "rule", categoria: "liquidez",
      titulo: "Liquidez corrente abaixo de 1",
      mensagem: `Liquidez corrente de ${last.k.liquidez_corrente.toFixed(2)} indica dificuldade de honrar passivos de curto prazo em ${periodo}.`,
      recomendacao: "Renegociar prazos de fornecedores ou acelerar recebíveis.",
      metricas: { liquidez_corrente: last.k.liquidez_corrente },
      ano: last.ano, mes: last.mes,
    });
  }
  if (last.k.endividamento != null && last.k.endividamento > 0.7) {
    out.push({
      severidade: "bad", origem: "rule", categoria: "endividamento",
      titulo: "Endividamento elevado",
      mensagem: `Endividamento de ${(last.k.endividamento * 100).toFixed(1)}% — risco de insolvência.`,
      recomendacao: "Avaliar reestruturação de dívidas e reforço de PL.",
      metricas: { endividamento: last.k.endividamento },
      ano: last.ano, mes: last.mes,
    });
  }
  if (last.k.margem_liquida != null && last.k.margem_liquida < 0) {
    out.push({
      severidade: "bad", origem: "rule", categoria: "rentabilidade",
      titulo: "Margem líquida negativa",
      mensagem: `Margem líquida de ${(last.k.margem_liquida * 100).toFixed(1)}% em ${periodo} — operação consumindo caixa.`,
      recomendacao: "Revisar precificação, custos e despesas operacionais.",
      metricas: { margem_liquida: last.k.margem_liquida },
      ano: last.ano, mes: last.mes,
    });
  }
  if (prev && prev.k.receita > 0 && last.k.receita > 0) {
    const drop = (last.k.receita - prev.k.receita) / prev.k.receita;
    if (drop <= -0.15) {
      out.push({
        severidade: "warn", origem: "rule", categoria: "receita",
        titulo: "Queda relevante de receita",
        mensagem: `Receita líquida caiu ${(drop * 100).toFixed(1)}% em relação a ${monthLabel(prev.ano, prev.mes)}.`,
        recomendacao: "Investigar canais, sazonalidade e churn de clientes.",
        metricas: { delta_receita: drop, receita_atual: last.k.receita, receita_anterior: prev.k.receita },
        ano: last.ano, mes: last.mes,
      });
    }
  }
  if (prev && prev.k.custos > 0) {
    const up = (last.k.custos - prev.k.custos) / prev.k.custos;
    if (up >= 0.15) {
      out.push({
        severidade: "warn", origem: "rule", categoria: "custos",
        titulo: "Aumento relevante de custos",
        mensagem: `Custos cresceram ${(up * 100).toFixed(1)}% vs ${monthLabel(prev.ano, prev.mes)}.`,
        recomendacao: "Mapear principais drivers de custo e renegociar contratos.",
        metricas: { delta_custos: up },
        ano: last.ano, mes: last.mes,
      });
    }
  }
  if (last.k.margem_ebitda != null && last.k.margem_ebitda > 0.15) {
    out.push({
      severidade: "ok", origem: "rule", categoria: "rentabilidade",
      titulo: "Margem EBITDA saudável",
      mensagem: `Margem EBITDA de ${(last.k.margem_ebitda * 100).toFixed(1)}% em ${periodo}.`,
      ano: last.ano, mes: last.mes,
    });
  }
  return out;
}

async function aiAlerts(serie: { ano: number; mes: number; k: ReturnType<typeof calcKPIs> }[], apiKey: string) {
  if (!apiKey || serie.length < 2) return [];
  const last = serie[serie.length - 1];
  const compact = serie.slice(-6).map(s => ({
    competencia: monthLabel(s.ano, s.mes),
    receita: Math.round(s.k.receita), ebitda: Math.round(s.k.ebitda), resultado: Math.round(s.k.result),
    margem_liquida: s.k.margem_liquida, margem_ebitda: s.k.margem_ebitda,
    liquidez_corrente: s.k.liquidez_corrente, endividamento: s.k.endividamento,
    capital_giro: Math.round(s.k.capital_giro),
  }));
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um auditor contábil sênior. Analise indicadores financeiros mensais e gere insights acionáveis em português, focando em tendências, riscos e oportunidades. Seja objetivo." },
          { role: "user", content: `Indicadores dos últimos ${compact.length} meses (mais recente por último):\n${JSON.stringify(compact, null, 2)}\n\nGere de 2 a 4 insights sobre a evolução financeira.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "emit_insights",
            description: "Emite uma lista de insights financeiros estruturados.",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      severidade: { type: "string", enum: ["info", "ok", "warn", "bad"] },
                      categoria: { type: "string" },
                      titulo: { type: "string" },
                      mensagem: { type: "string" },
                      recomendacao: { type: "string" },
                    },
                    required: ["severidade", "categoria", "titulo", "mensagem"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["insights"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_insights" } },
      }),
    });
    if (!resp.ok) {
      console.error("AI gateway", resp.status, await resp.text());
      return [];
    }
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : {};
    const items = Array.isArray(parsed.insights) ? parsed.insights : [];
    return items.map((it: any) => ({
      severidade: it.severidade || "info",
      origem: "ai",
      categoria: it.categoria || "ia",
      titulo: it.titulo || "Insight",
      mensagem: it.mensagem || "",
      recomendacao: it.recomendacao || null,
      metricas: {},
      ano: last.ano, mes: last.mes,
    }));
  } catch (e) {
    console.error("aiAlerts error", e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { company_id, persist = true } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [bsRes, dreRes] = await Promise.all([
      admin.from("bs_consolidado")
        .select("ano, mes, secao, grupo, nivel, valor, descricao, codigo")
        .eq("company_id", company_id),
      admin.from("dre_consolidado")
        .select("ano, mes, grupo, valor, descricao")
        .eq("company_id", company_id),
    ]);
    const bs = (bsRes.data || []) as BSRow[];
    const dre = (dreRes.data || []) as DRERow[];

    const periods = Array.from(new Set(bs.map(r => `${r.ano}-${String(r.mes).padStart(2, "0")}`)))
      .sort()
      .slice(-6);
    const serie = periods.map(p => {
      const [ano, mes] = p.split("-").map(Number);
      const bsP = bs.filter(r => r.ano === ano && r.mes === mes);
      const dreP = dre.filter(r => r.ano === ano && r.mes === mes);
      return { ano, mes, k: calcKPIs(bsP, dreP) };
    });

    if (serie.length === 0) {
      return new Response(JSON.stringify({ alerts: [], message: "Sem dados consolidados" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    const [rules, ai] = await Promise.all([
      Promise.resolve(ruleAlerts(serie)),
      aiAlerts(serie, apiKey),
    ]);
    const all = [...rules, ...ai].map(a => ({
      ...a,
      company_id,
      periodo_ref: a.ano && a.mes ? monthLabel(a.ano, a.mes) : null,
    }));

    if (persist && all.length) {
      // Substitui alertas anteriores da empresa para evitar acúmulo
      await admin.from("financial_alerts").delete().eq("company_id", company_id);
      const { error } = await admin.from("financial_alerts").insert(all);
      if (error) console.error("insert alerts", error);
    }

    return new Response(JSON.stringify({ alerts: all, generated: all.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("financial-alerts error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
