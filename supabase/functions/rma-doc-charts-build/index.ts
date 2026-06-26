// rma-doc-charts-build
// Gera e persiste KPIs e gráficos de um rma_documents a partir do
// balancete_consolidado e de rma_period_analyses (indicadores/kanitz/score_rj).
//
// Body (POST):
//   { document_id: string, months?: number, force?: boolean }
//
// Resposta:
//   { ok, document_id, kpis_count, charts_count, sections_updated, periods_used }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const fmtPeriodo = (a: number, m: number) =>
  `${String(m).padStart(2, "0")}-${a}`;

function sumByGrupo(rows: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const g = String(r.grupo || r.tipo || "outros").toUpperCase();
    out[g] = (out[g] || 0) + Number(r.valor || 0);
  }
  return out;
}

function pct(num: number, den: number): number | null {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10; // 1 casa decimal
}

// Mapeia palavras-chave do título da seção → tipo de gráfico
const SECTION_HINTS: Array<{ match: RegExp; charts: string[] }> = [
  { match: /receita|operacional/i, charts: ["evolucao_receita", "composicao_resultado"] },
  { match: /custo|despesa/i, charts: ["composicao_despesa", "evolucao_custos"] },
  { match: /liquidez/i, charts: ["evolucao_liquidez"] },
  { match: /endividamento|passivo|estrutura de capital/i, charts: ["evolucao_endividamento"] },
  { match: /indicadores|isg|solv[eê]ncia|kanitz/i, charts: ["evolucao_kanitz", "evolucao_score_rj"] },
  { match: /análise financeira|sumário|conclus|parecer/i, charts: ["evolucao_receita", "evolucao_kanitz"] },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { document_id, months = 12, force = false } = await req.json();
    if (!document_id) throw new Error("document_id obrigatório");

    // 1) Documento + empresa
    const docs = await sb<any[]>(
      `rma_documents?id=eq.${document_id}&select=id,rma_id,tipo,titulo&limit=1`,
    );
    const doc = docs[0];
    if (!doc) throw new Error("documento não encontrado");

    const companies = await sb<any[]>(
      `companies?rma_id=eq.${encodeURIComponent(doc.rma_id)}&select=id,name&limit=1`,
    );
    const company = companies[0];
    if (!company) throw new Error("empresa do documento não encontrada");

    // 2) Limpa charts anteriores se force
    if (force) {
      await sb(`rma_document_charts?document_id=eq.${document_id}`, { method: "DELETE" });
    }

    // 3) Balancete: pega últimos N (ano,mes) distintos
    const balRows = await sb<any[]>(
      `balancete_consolidado?company_id=eq.${company.id}&select=ano,mes,grupo,tipo,valor,conta,descricao&order=ano.desc,mes.desc&limit=5000`,
    );
    const periodMap = new Map<string, any[]>();
    for (const r of balRows) {
      const key = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
      if (!periodMap.has(key)) periodMap.set(key, []);
      periodMap.get(key)!.push(r);
    }
    const periodKeys = Array.from(periodMap.keys()).sort().slice(-months);
    const periods = periodKeys.map((k) => {
      const [y, m] = k.split("-").map(Number);
      return { ano: y, mes: m, label: fmtPeriodo(y, m), rows: periodMap.get(k) || [] };
    });

    // 4) Period analyses (indicadores/kanitz/score_rj)
    const analyses = await sb<any[]>(
      `rma_period_analyses?company_id=eq.${company.id}&select=year,month,period_label,indicadores,kanitz,score_rj&order=year.asc,month.asc`,
    );
    const analysisByKey = new Map<string, any>();
    for (const a of analyses) {
      analysisByKey.set(`${a.year}-${String(a.month).padStart(2, "0")}`, a);
    }

    // 5) KPIs do período mais recente
    const last = periods[periods.length - 1];
    const kpis: any[] = [];
    let lastTotals: Record<string, number> = {};
    if (last) {
      lastTotals = sumByGrupo(last.rows);
      const receita = lastTotals["RECEITA"] || 0;
      const custo = lastTotals["CUSTO"] || 0;
      const despesa = lastTotals["DESPESA"] || 0;
      const imposto = lastTotals["IMPOSTO"] || 0;
      const resultado = receita - custo - despesa - imposto;
      kpis.push(
        { label: "Receita Bruta", valor: receita, unidade: "BRL", periodo: last.label },
        { label: "Custos", valor: custo, unidade: "BRL", periodo: last.label },
        { label: "Despesas", valor: despesa, unidade: "BRL", periodo: last.label },
        { label: "Impostos", valor: imposto, unidade: "BRL", periodo: last.label },
        { label: "Resultado Operacional", valor: resultado, unidade: "BRL", periodo: last.label },
        { label: "Margem Operacional", valor: pct(resultado, receita), unidade: "%", periodo: last.label },
        { label: "Peso de Custos", valor: pct(custo, receita), unidade: "%", periodo: last.label },
        { label: "Peso de Despesas", valor: pct(despesa, receita), unidade: "%", periodo: last.label },
      );
      const ana = analysisByKey.get(`${last.ano}-${String(last.mes).padStart(2, "0")}`);
      if (ana?.kanitz?.fi != null) {
        kpis.push({ label: "Kanitz FI", valor: Number(ana.kanitz.fi), unidade: "idx", periodo: last.label });
      }
      if (ana?.score_rj?.score != null) {
        kpis.push({ label: "BEx-RJ Score", valor: Number(ana.score_rj.score), unidade: "0-100", periodo: last.label });
      }
      if (ana?.indicadores?.liquidez_corrente != null) {
        kpis.push({ label: "Liquidez Corrente", valor: Number(ana.indicadores.liquidez_corrente), unidade: "x", periodo: last.label });
      }
      if (ana?.indicadores?.endividamento != null) {
        kpis.push({ label: "Endividamento", valor: Number(ana.indicadores.endividamento), unidade: "%", periodo: last.label });
      }
    }

    // 6) Constrói gráficos
    type Chart = {
      key: string;
      tipo: "linha" | "barra" | "pizza" | "area";
      titulo: string;
      dados: any;
      descricao_ia: string;
      fonte: any;
    };
    const charts: Chart[] = [];

    // 6.1 Evolução da Receita
    if (periods.length) {
      const series = periods.map((p) => {
        const t = sumByGrupo(p.rows);
        return { periodo: p.label, valor: Math.round((t["RECEITA"] || 0) * 100) / 100 };
      });
      charts.push({
        key: "evolucao_receita",
        tipo: "linha",
        titulo: "Evolução da Receita",
        dados: { series, x: "periodo", y: "valor", unidade: "BRL" },
        descricao_ia: `Receita em ${periods.length} períodos. Último: ${last?.label} = ${(lastTotals["RECEITA"] || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
        fonte: { tabela: "balancete_consolidado", company_id: company.id, periodos: periods.map((p) => p.label) },
      });
    }

    // 6.2 Evolução de Custos & Despesas
    if (periods.length) {
      const series = periods.map((p) => {
        const t = sumByGrupo(p.rows);
        return {
          periodo: p.label,
          custo: Math.round((t["CUSTO"] || 0) * 100) / 100,
          despesa: Math.round((t["DESPESA"] || 0) * 100) / 100,
        };
      });
      charts.push({
        key: "evolucao_custos",
        tipo: "barra",
        titulo: "Evolução de Custos e Despesas",
        dados: { series, x: "periodo", y: ["custo", "despesa"], unidade: "BRL" },
        descricao_ia: "Comparativo mensal de custos e despesas operacionais.",
        fonte: { tabela: "balancete_consolidado", company_id: company.id, periodos: periods.map((p) => p.label) },
      });
    }

    // 6.3 Composição do Resultado (último período)
    if (last) {
      const t = lastTotals;
      const data = [
        { categoria: "Custos", valor: Math.round((t["CUSTO"] || 0) * 100) / 100 },
        { categoria: "Despesas", valor: Math.round((t["DESPESA"] || 0) * 100) / 100 },
        { categoria: "Impostos", valor: Math.round((t["IMPOSTO"] || 0) * 100) / 100 },
      ].filter((d) => d.valor > 0);
      if (data.length) {
        charts.push({
          key: "composicao_resultado",
          tipo: "pizza",
          titulo: `Composição de Saídas — ${last.label}`,
          dados: { series: data, label: "categoria", value: "valor", unidade: "BRL" },
          descricao_ia: `Distribuição percentual de custos, despesas e impostos sobre saídas em ${last.label}.`,
          fonte: { tabela: "balancete_consolidado", company_id: company.id, periodo: last.label },
        });
      }
    }

    // 6.4 Composição de Despesas por subgrupo (top 8)
    if (last) {
      const desp: Record<string, number> = {};
      for (const r of last.rows) {
        if (String(r.grupo || "").toUpperCase() !== "DESPESA") continue;
        const k = String(r.descricao || r.conta || "outros").slice(0, 60);
        desp[k] = (desp[k] || 0) + Number(r.valor || 0);
      }
      const top = Object.entries(desp)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([categoria, valor]) => ({ categoria, valor: Math.round(valor * 100) / 100 }));
      if (top.length) {
        charts.push({
          key: "composicao_despesa",
          tipo: "barra",
          titulo: `Top Despesas — ${last.label}`,
          dados: { series: top, x: "categoria", y: ["valor"], unidade: "BRL" },
          descricao_ia: `Principais contas de despesa em ${last.label}.`,
          fonte: { tabela: "balancete_consolidado", company_id: company.id, periodo: last.label },
        });
      }
    }

    // 6.5 Evolução Kanitz / Score RJ / Liquidez / Endividamento (de period_analyses)
    const indicadorSeries = (key: "kanitz" | "score_rj" | "liquidez_corrente" | "endividamento") => {
      const series: any[] = [];
      for (const a of analyses) {
        let v: number | null = null;
        if (key === "kanitz") v = a.kanitz?.fi ?? null;
        else if (key === "score_rj") v = a.score_rj?.score ?? null;
        else v = a.indicadores?.[key] ?? null;
        if (v != null && !Number.isNaN(Number(v))) {
          series.push({ periodo: a.period_label, valor: Number(v) });
        }
      }
      return series;
    };

    const kanitzS = indicadorSeries("kanitz");
    if (kanitzS.length >= 2) {
      charts.push({
        key: "evolucao_kanitz",
        tipo: "linha",
        titulo: "Evolução do Fator de Insolvência (Kanitz)",
        dados: { series: kanitzS, x: "periodo", y: "valor", unidade: "idx" },
        descricao_ia: "Tendência do FI Kanitz. Valores acima de 0 indicam solvência; abaixo de -3, insolvência.",
        fonte: { tabela: "rma_period_analyses", company_id: company.id },
      });
    }

    const scoreS = indicadorSeries("score_rj");
    if (scoreS.length >= 2) {
      charts.push({
        key: "evolucao_score_rj",
        tipo: "linha",
        titulo: "Evolução do BEx-RJ Score",
        dados: { series: scoreS, x: "periodo", y: "valor", unidade: "0-100" },
        descricao_ia: "Score de risco de Recuperação Judicial (0–100).",
        fonte: { tabela: "rma_period_analyses", company_id: company.id },
      });
    }

    const liqS = indicadorSeries("liquidez_corrente");
    if (liqS.length >= 2) {
      charts.push({
        key: "evolucao_liquidez",
        tipo: "linha",
        titulo: "Evolução da Liquidez Corrente",
        dados: { series: liqS, x: "periodo", y: "valor", unidade: "x" },
        descricao_ia: "Capacidade de honrar obrigações de curto prazo.",
        fonte: { tabela: "rma_period_analyses", company_id: company.id },
      });
    }

    const endS = indicadorSeries("endividamento");
    if (endS.length >= 2) {
      charts.push({
        key: "evolucao_endividamento",
        tipo: "linha",
        titulo: "Evolução do Endividamento",
        dados: { series: endS, x: "periodo", y: "valor", unidade: "%" },
        descricao_ia: "Participação de capital de terceiros sobre o total.",
        fonte: { tabela: "rma_period_analyses", company_id: company.id },
      });
    }

    // 7) Persiste charts
    const chartIdByKey: Record<string, string> = {};
    if (charts.length) {
      const payload = charts.map((c) => ({
        document_id,
        tipo: c.tipo,
        titulo: c.titulo,
        dados: c.dados,
        descricao_ia: c.descricao_ia,
        fonte: { ...c.fonte, key: c.key },
      }));
      const inserted = await sb<any[]>("rma_document_charts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      inserted.forEach((row, i) => {
        chartIdByKey[charts[i].key] = row.id;
      });
    }

    // 8) Atualiza KPIs/charts nas seções (match por título)
    const sections = await sb<any[]>(
      `rma_document_sections?document_id=eq.${document_id}&select=id,titulo,numero,kpis,graficos_ids,chart_meta`,
    );
    let sectionsUpdated = 0;
    for (const sec of sections) {
      const matched = SECTION_HINTS.find((h) => h.match.test(sec.titulo || ""));
      if (!matched) continue;
      const ids = matched.charts.map((k) => chartIdByKey[k]).filter(Boolean);
      const meta = matched.charts
        .filter((k) => chartIdByKey[k])
        .map((k) => ({ key: k, chart_id: chartIdByKey[k], titulo: charts.find((c) => c.key === k)?.titulo }));

      // KPIs por seção: financeira/sumário recebem todos, demais recebem nada novo
      const isResumo = /sumário|análise financeira|conclus|parecer/i.test(sec.titulo || "");
      const sectionKpis = isResumo ? kpis : sec.kpis;

      await sb(`rma_document_sections?id=eq.${sec.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          kpis: sectionKpis,
          graficos_ids: ids,
          chart_meta: meta,
          dados_origem: [
            { tabela: "balancete_consolidado", company_id: company.id, periodos: periods.map((p) => p.label) },
            { tabela: "rma_period_analyses", company_id: company.id },
          ],
        }),
      });

      // Rastreabilidade: registra fontes na tabela dedicada (idempotente)
      await sb(
        `rma_section_data_sources?section_id=eq.${sec.id}&source_type=in.(balancete_consolidado,period_analysis,chart)`,
        { method: "DELETE" },
      ).catch(() => {});

      const fontes: any[] = [];
      for (const p of periods) {
        fontes.push({
          section_id: sec.id,
          document_id,
          source_type: "balancete_consolidado",
          source_table: "balancete_consolidado",
          company_id: company.id,
          ano: p.ano,
          mes: p.mes,
          periodo_label: p.label,
          trecho: `Balancete consolidado ${p.label}`,
        });
      }
      for (const a of analyses) {
        fontes.push({
          section_id: sec.id,
          document_id,
          source_type: "period_analysis",
          source_table: "rma_period_analyses",
          company_id: company.id,
          ano: a.year,
          mes: a.month,
          periodo_label: a.period_label,
          trecho: `Indicadores ${a.period_label}`,
        });
      }
      for (const k of matched.charts) {
        const cid = chartIdByKey[k];
        if (!cid) continue;
        fontes.push({
          section_id: sec.id,
          document_id,
          source_type: "chart",
          source_table: "rma_document_charts",
          source_id: cid,
          company_id: company.id,
          trecho: charts.find((c) => c.key === k)?.titulo,
        });
      }
      if (fontes.length) {
        await sb("rma_section_data_sources", {
          method: "POST",
          body: JSON.stringify(fontes),
        }).catch((err) => console.error("[sources insert]", err));
      }
      sectionsUpdated++;
    }

    // 9) bump versão do documento (auto-sync)
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/rma_document_bump_version`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_document_id: document_id }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        ok: true,
        document_id,
        company_id: company.id,
        periods_used: periods.map((p) => p.label),
        kpis_count: kpis.length,
        charts_count: charts.length,
        sections_updated: sectionsUpdated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[rma-doc-charts-build]", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
