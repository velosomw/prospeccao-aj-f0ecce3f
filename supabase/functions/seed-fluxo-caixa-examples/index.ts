// seed-fluxo-caixa-examples — registra o AGENTE_FLUXO_CAIXA + 3 exemplos canônicos
// (Projeção 12 meses 01/2026, Realizado 12/2025, Realizado 11/2025) em ocr_agents,
// dataset_validated e prompt_examples (com embedding 768d) para ativar few-shot.
//
// POST {} → idempotente.
// GET     → status (quantos exemplos canônicos já estão ativos).

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;

const SEED_TAG = "[seed:fluxo-caixa-canonical-v1]";
const AGENT_NAME = "AGENTE_FLUXO_CAIXA";
const CLASSE = "FLUXO_CAIXA";

type Example = {
  key: "projecao_01_2026" | "realizado_12_2025" | "realizado_11_2025";
  notes: string;
  input_text: string;
  output_correto: Record<string, unknown>;
};

const EXAMPLES: Example[] = [
  {
    key: "projecao_01_2026",
    notes: `${SEED_TAG} DIP FRANGOS — Projeção Fluxo 12 Meses 01/2026 (XLSM, sheet "Projeção de Fluxo")`,
    input_text:
      `### Sheet: Projeção de Fluxo (36x13) — 12 colunas mensais 2026-01..2026-12\n` +
      `Linha;Conta;2026-01;2026-02;2026-03;...;2026-12\n` +
      `3;Serviços;20.297.851,64;19.915.781,64;...;21.281.968,80\n` +
      `5;Ind.Oleo;2.297.400,00;2.144.240,00;...;2.220.820,00\n` +
      `6;(+) Entradas;22.595.251,64;22.060.021,64;...;23.502.788,80\n` +
      `8;Folha;6.389.146,20;...;10.180.467,62\n` +
      `9;FGTS;553.981,67;...;601.971,84\n` +
      `10;INSS;2.012.018,69;...;2.175.735,97\n` +
      `11;Outros Gastos c/Pessoal;1.890.559,79;...;2.057.031,70\n` +
      `12;(-) Mão de Obra;10.845.706,36;...;15.015.207,12\n` +
      `14;Energia;2.489.682,45;...;2.394.054,04\n` +
      `15;Material de Consumo;2.444.749,16;...;2.349.861,68\n` +
      `16;Manutenção;1.450.648,91;... (constante)\n` +
      `17;Outros Gastos;1.524.148,69;...;1.524.148,69\n` +
      `18;Tributárias;254.550,00;... (constante)\n` +
      `19;(-) Gastos;8.163.779,21;...;7.973.263,32\n` +
      `22;Despesas Financeiras (Operacional);180.550,00;... (constante)\n` +
      `23;Despesas Financeiras (Empréstimos);1.700,00;... (constante)\n` +
      `24;(-) Resultado Financeiro;182.250,00\n` +
      `27;PisCofins a Pagar;0,00;0,00;132.690,96;...;157.938,12\n` +
      `28;IR e CSLL a Pagar;0,00;38.049,21;...;663.896,53\n` +
      `29;(-) Impostos a Pagar;0,00;...;821.834,65\n` +
      `31;(=) Caixa Gerado no Período;3.403.516,07;...;-489.766,28\n` +
      `33;(-) Parcelamentos;1.606.028,03;...;619.197,80\n` +
      `35;(=) Caixa Líquido;1.797.488,04;...;-1.108.964,08\n` +
      `36;Acumulado;1.797.488,04;3.258.340,58;...;13.986.550,95`,
    output_correto: {
      layout: "projecao_12_meses",
      tipo: "projecao",
      periodo_inicio: "2026-01",
      periodo_fim: "2026-12",
      meses: [
        { mes: "2026-01", entradas: 22595251.64, mao_obra: 10845706.36, gastos: 8163779.21, financeiro: 182250.00, impostos: 0.00, caixa_periodo: 3403516.07, parcelamentos: 1606028.03, caixa_liquido: 1797488.04, acumulado: 1797488.04 },
        { mes: "2026-02", entradas: 22060021.64, mao_obra: 10826645.20, gastos: 8016849.62, financeiro: 182250.00, impostos: 38049.21, caixa_periodo: 2996227.61, parcelamentos: 1535375.08, caixa_liquido: 1460852.53, acumulado: 3258340.58 },
        { mes: "2026-12", entradas: 23502788.80, mao_obra: 15015207.12, gastos: 7973263.32, financeiro: 182250.00, impostos: 821834.65, caixa_periodo: -489766.28, parcelamentos: 619197.80, caixa_liquido: -1108964.08, acumulado: 13986550.95 },
      ],
      totais_ano: {
        entradas: 274615068.41,
        mao_obra: 137406674.62,
        gastos: 97513736.78,
        impostos: 7965372.80,
        parcelamentos: 12755734.31,
        caixa_liquido_ano: 13986550.95,
      },
      alertas: ["caixa_liquido_negativo_nov_dez_2026"],
      confianca: 0.97,
    },
  },
  {
    key: "realizado_12_2025",
    notes: `${SEED_TAG} DIP FRANGOS — Fluxo de Caixa Realizado 12/2025 (XLSX, sheet "DEZEMBRO 2025")`,
    input_text:
      `FLUXO DE CAIXA REALIZADO — Proc. Ref. 99-100-01 Tesouraria\n` +
      `DEZEMBRO 2025\n` +
      `Saldo Inicial: 2.623,41\n` +
      `Entradas:\n` +
      `  Recebimento clientes - depósito Plum: 803.186,15\n` +
      `  Recebimento Ind óleo - depósito: 4.569.996,56\n` +
      `  Plusval: 20.529.594,18\n` +
      `  Outras entradas: 6.213.821,66\n` +
      `  Industrialização: 3.632.021,79\n` +
      `  TOTAL ENTRADAS: 35.751.243,75\n` +
      `Saídas:\n` +
      `  Fábrica ração: 264.737,01 | Frigorífico: 4.168.352,35 | Indústria Óleo: 2.089.958,28 | Incubatório: 214.755,05\n` +
      `  Fretes: 58.236,29 | Copel/água/telefone: 2.404.903,75\n` +
      `  Acordos trabalhistas e fornecedores: 4.516.984,56\n` +
      `  INSS, FGTS, parcelamentos e taxas: 4.439.246,64\n` +
      `  Pessoal (férias, rescisões, salário): 7.294.439,41\n` +
      `  Vale Alimentação: 1.819.114,37 | Terceiros: 658.709,50 | Acordo Fundos: 0,00\n` +
      `  Despesas diversas: 7.314.425,15 | Empréstimo Jornal: 409.056,00\n` +
      `  Tarifa: 27.393,83 | Bloqueio Judicial: 60.948,34\n` +
      `  TOTAL SAÍDAS: 35.741.260,53\n` +
      `Cta Sicoob + C.E.F.: 9.983,22 (= Saldo final bancário)\n` +
      `Saldo do caixa: 495.106,59 | Composição Sede (Dinheiro): 487.362,43\n` +
      `Filiais: Fábrica Ração 1.008,71; Capanema 1.152,74; Ind. Óleo 5.581,12; Realeza 1,59`,
    output_correto: {
      layout: "fluxo_realizado_mensal",
      tipo: "realizado",
      periodo: "2025-12",
      saldo_inicial: 2623.41,
      entradas: {
        recebimento_clientes_plum: 803186.15,
        recebimento_ind_oleo: 4569996.56,
        plusval: 20529594.18,
        outras_entradas: 6213821.66,
        industrializacao: 3632021.79,
        total: 35751243.75,
      },
      saidas: {
        fabrica_racao: 264737.01,
        frigorifico: 4168352.35,
        industria_oleo: 2089958.28,
        incubatorio: 214755.05,
        fretes: 58236.29,
        utilidades: 2404903.75,
        acordos_trab_forn: 4516984.56,
        inss_fgts_parcelamentos: 4439246.64,
        pessoal: 7294439.41,
        vale_alimentacao: 1819114.37,
        terceiros: 658709.50,
        acordo_fundos: 0.00,
        despesas_diversas: 7314425.15,
        emprestimo_jornal: 409056.00,
        tarifa: 27393.83,
        bloqueio_judicial: 60948.34,
        total: 35741260.53,
      },
      saldo_bancario_final: 9983.22,
      saldo_caixa_sede: 487362.43,
      saldo_caixa_filiais: { fabrica_racao: 1008.71, capanema: 1152.74, ind_oleo: 5581.12, realeza: 1.59 },
      saldo_caixa_total: 495106.59,
      variacao_liquida: 9983.22,
      alertas: [],
      confianca: 0.98,
    },
  },
  {
    key: "realizado_11_2025",
    notes: `${SEED_TAG} DIP FRANGOS — Fluxo de Caixa Realizado 11/2025 (XLSX, sheet "NOVEMBRO")`,
    input_text:
      `FLUXO DE CAIXA REALIZADO — Proc. Ref. 99-100-01 Tesouraria\n` +
      `NOVEMBRO 2025\n` +
      `Saldo Inicial: 3.318,45\n` +
      `Entradas:\n` +
      `  Recebimento clientes Plum: 646.874,84 | Recebimento Ind óleo: 4.198.768,30\n` +
      `  Plusval: 17.185.489,36 | Outras entradas: 5.451.194,96 | Industrialização: 3.231.946,69\n` +
      `  TOTAL ENTRADAS: 30.717.592,60\n` +
      `Saídas:\n` +
      `  Fábrica ração: 238.242,95 | Frigorífico: 3.284.092,18 | Indústria Óleo: 2.038.457,92 | Incubatório: 181.436,34\n` +
      `  Fretes: 59.152,14 | Copel/água/telefone: 2.152.321,37\n` +
      `  Acordos trabalhistas e fornecedores: 2.515.526,99\n` +
      `  INSS, FGTS, parcelamentos e taxas: 3.027.079,03\n` +
      `  Pessoal: 7.308.516,50 | Vale Alimentação: 1.100.788,59 | Terceiros: 411.729,75 | Acordo Fundos: 0,00\n` +
      `  Despesas diversas: 8.243.229,41 | Empréstimo Jornal: 144.486,00 | Tarifa: 9.910,02 | Bloqueio Judicial: 0,00\n` +
      `  TOTAL SAÍDAS: 30.714.969,19\n` +
      `Cta Sicoob + C.E.F.: 2.623,41 (= Saldo final bancário, vira Saldo Inicial 12/2025)\n` +
      `Saldo do caixa: 368.535,21 | Sede (Dinheiro): 349.240,63\n` +
      `Filiais: Fábrica Ração 5.808,29; Capanema 411,52; Ind. Óleo 9.152,59; Realeza 3.922,18`,
    output_correto: {
      layout: "fluxo_realizado_mensal",
      tipo: "realizado",
      periodo: "2025-11",
      saldo_inicial: 3318.45,
      entradas: {
        recebimento_clientes_plum: 646874.84,
        recebimento_ind_oleo: 4198768.30,
        plusval: 17185489.36,
        outras_entradas: 5451194.96,
        industrializacao: 3231946.69,
        total: 30717592.60,
      },
      saidas: {
        fabrica_racao: 238242.95,
        frigorifico: 3284092.18,
        industria_oleo: 2038457.92,
        incubatorio: 181436.34,
        fretes: 59152.14,
        utilidades: 2152321.37,
        acordos_trab_forn: 2515526.99,
        inss_fgts_parcelamentos: 3027079.03,
        pessoal: 7308516.50,
        vale_alimentacao: 1100788.59,
        terceiros: 411729.75,
        acordo_fundos: 0.00,
        despesas_diversas: 8243229.41,
        emprestimo_jornal: 144486.00,
        tarifa: 9910.02,
        bloqueio_judicial: 0.00,
        total: 30714969.19,
      },
      saldo_bancario_final: 2623.41,
      saldo_caixa_sede: 349240.63,
      saldo_caixa_filiais: { fabrica_racao: 5808.29, capanema: 411.52, ind_oleo: 9152.59, realeza: 3922.18 },
      saldo_caixa_total: 368535.21,
      variacao_liquida: 2623.41 - 3318.45,
      encadeamento: { proximo_mes: "2025-12", saldo_inicial_proximo: 2623.41 },
      alertas: [],
      confianca: 0.98,
    },
  },
];

const SYSTEM_PROMPT = `Você é o AGENTE_FLUXO_CAIXA do RMA DIP Frangos. Extrai dados de:
1) "Projeção Fluxo 12 Meses" (XLSM, sheet "Projeção de Fluxo"): tabela 12 colunas mensais com linhas Entradas, Mão de Obra, Gastos, Resultado Financeiro, Impostos, Parcelamentos, Caixa Líquido, Acumulado.
2) "Fluxo de Caixa Realizado" mensal (XLSX, sheet "<MES> <ANO>"): blocos Entradas, Saídas, Saldo bancário (Cta Sicoob+CEF), Saldo do caixa (Sede+Filiais).
Regras:
- Validar Saldo Inicial(mes+1) == Saldo Bancário Final(mes) (tolerância 0,01).
- Validar TOTAL ENTRADAS - TOTAL SAÍDAS ≈ Variação do Saldo Bancário.
- Para projeção: Caixa Líquido = Caixa Gerado − Parcelamentos; Acumulado(n) = Acumulado(n−1)+Caixa Líquido(n).
- Sinalizar alertas: caixa_liquido_negativo, divergencia_encadeamento, divergencia_total.
Saída sempre em JSON conforme exemplos few-shot.`;

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}

async function embedText(text: string): Promise<number[] | null> {
  if (GOOGLE_AI_API_KEY) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBED_DIMS,
          taskType: "RETRIEVAL_DOCUMENT",
        }),
      },
    );
    if (r.ok) {
      const j = await r.json();
      return j?.embedding?.values ?? null;
    }
    console.error("[seed-fc] gemini embed failed", r.status, (await r.text()).slice(0, 300));
  }
  if (LOVABLE_API_KEY) {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({ model: `google/${EMBED_MODEL}`, input: [text] }),
    });
    if (r.ok) {
      const j = await r.json();
      return j?.data?.[0]?.embedding ?? null;
    }
    console.error("[seed-fc] gateway embed failed", r.status, (await r.text()).slice(0, 300));
  }
  return null;
}

async function upsertAgent() {
  const existR = await sb(`/ocr_agents?select=id&name=eq.${encodeURIComponent(AGENT_NAME)}&limit=1`);
  const exist = await existR.json();
  const payload = {
    name: AGENT_NAME,
    description: "Agente especialista em Fluxo de Caixa (Projeção 12 meses + Realizado mensal) — DIP Frangos.",
    folder_path: "/RMA/Financeiro/Fluxo_Caixa",
    accepted_types: ["xlsx", "xlsm", "xls", "pdf"],
    ocr_engine: "tesseract",
    ai_model: "google/gemini-2.5-pro",
    temperature: 0.20,
    sub_agents: [],
    classification_rules: [
      { match: "Projeção de Fluxo", layout: "projecao_12_meses" },
      { match: "FLUXO DE CAIXA REALIZADO", layout: "fluxo_realizado_mensal" },
    ],
    system_prompt: SYSTEM_PROMPT,
    status: "active",
  };
  if (Array.isArray(exist) && exist.length > 0) {
    const r = await sb(`/ocr_agents?id=eq.${exist[0].id}`, { method: "PATCH", body: JSON.stringify(payload) });
    return { id: exist[0].id, action: r.ok ? "updated" : "error" };
  }
  const r = await sb(`/ocr_agents`, { method: "POST", body: JSON.stringify(payload) });
  const row = (await r.json())?.[0];
  return { id: row?.id, action: r.ok ? "created" : "error" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    const r = await sb(
      `/dataset_validated?select=id,notes&classe=eq.${CLASSE}&notes=like.${encodeURIComponent("%" + SEED_TAG + "%")}`,
    );
    const rows = await r.json();
    return new Response(
      JSON.stringify({ ok: true, seeded: rows?.length ?? 0, tag: SEED_TAG, agent: AGENT_NAME }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const agent = await upsertAgent();
    const results: Array<Record<string, unknown>> = [];

    for (const ex of EXAMPLES) {
      const existResp = await sb(
        `/dataset_validated?select=id&classe=eq.${CLASSE}&notes=eq.${encodeURIComponent(ex.notes)}&limit=1`,
      );
      const exist = await existResp.json();
      if (Array.isArray(exist) && exist.length > 0) {
        results.push({ key: ex.key, status: "skipped", reason: "already_seeded", id: exist[0].id });
        continue;
      }

      const dvResp = await sb(`/dataset_validated`, {
        method: "POST",
        body: JSON.stringify({
          classe: CLASSE,
          agent: AGENT_NAME,
          input_text: ex.input_text,
          normalized_text: ex.input_text,
          output_original: null,
          output_correto: ex.output_correto,
          corrections: [],
          source: "seed",
          validated_by: null,
          notes: ex.notes,
        }),
      });
      if (!dvResp.ok) {
        results.push({ key: ex.key, status: "error", step: "dataset_validated", body: await dvResp.text() });
        continue;
      }
      const dv = (await dvResp.json())?.[0];

      const embedding = await embedText(ex.input_text);
      let exampleId: string | null = null;
      if (embedding && embedding.length === EMBED_DIMS) {
        const peResp = await sb(`/prompt_examples`, {
          method: "POST",
          body: JSON.stringify({
            validated_id: dv.id,
            classe: CLASSE,
            agent: AGENT_NAME,
            input_text: ex.input_text.slice(0, 4000),
            output_json: ex.output_correto,
            embedding: `[${embedding.join(",")}]`,
            weight: 1.0,
            active: true,
          }),
        });
        if (peResp.ok) exampleId = (await peResp.json())?.[0]?.id ?? null;
        else console.error("[seed-fc] prompt_examples insert failed:", await peResp.text());
      }

      results.push({
        key: ex.key,
        status: "seeded",
        validated_id: dv.id,
        prompt_example_id: exampleId,
        embedding_dims: embedding?.length ?? null,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, agent, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("seed-fluxo-caixa-examples error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
