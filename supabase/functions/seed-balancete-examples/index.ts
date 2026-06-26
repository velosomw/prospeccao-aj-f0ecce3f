// seed-balancete-examples — registra 2 exemplos canônicos de Balancete (Agrosys + Nardelli)
// em `dataset_validated` + `prompt_examples` (com embedding) para ativar few-shot do
// AGENTE_BALANCETE no `ai-process`.
//
// POST {} → idempotente: pula exemplos já existentes (match por agent+classe+notes).
// GET     → status atual (quantos exemplos canônicos já estão ativos).

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GOOGLE_AI_API_KEY = Deno.env.get("GOOGLE_AI_API_KEY");
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;

const SEED_TAG = "[seed:balancete-canonical-v1]";

type Example = {
  key: "agrosys" | "nardelli";
  notes: string;
  input_text: string;
  output_correto: Record<string, unknown>;
};

const EXAMPLES: Example[] = [
  {
    key: "agrosys",
    notes: `${SEED_TAG} DIP FRANGOS — Balancete Agrosys/AgroWeb 11/2024 (XLSX, 9 colunas)`,
    input_text:
      `### Sheet: Balancete (501 linhas)\n` +
      `Conta;Descrição;Saldo Anterior;Mov Débito;Mov Crédito;Saldo Atual;D/C;Nível;Grupo\n` +
      `1;ATIVO;310.682.948,18;440.313.006,98;436.544.893,04;314.451.062,12;D;1;ATIVO\n` +
      `1.1;ATIVO CIRCULANTE;;;;;D;2;ATIVO\n` +
      `2;PASSIVO E PATRIMÔNIO LÍQUIDO;310.078.148,77;358.556.732,85;363.122.908,24;314.644.324,16;C;1;PASSIVO\n` +
      `3;RECEITAS;0,00;0,00;220.648.129,63;220.648.129,63;C;1;RESULTADO\n` +
      `4;CUSTOS;0,00;200.141.850,01;0,00;200.141.850,01;D;1;RESULTADO\n` +
      `5;DESPESAS OPERACIONAIS;0,00;16.611.081,69;0,00;16.611.081,69;D;1;RESULTADO\n` +
      `6;DESPESAS FINANCEIRAS;0,00;4.422.090,03;0,00;4.422.090,03;D;1;RESULTADO\n` +
      `... (501 linhas, totais validados: Ativo = Passivo+PL − Resultado do Período)`,
    output_correto: {
      layout: "agrosys",
      ativo_total: 314451062.12,
      passivo_total: 314644324.16,
      patrimonio_liquido: null,
      resultado_periodo: -193262.04,
      receita_bruta: 220648129.63,
      receita_liquida: 220648129.63,
      custos: 200141850.01,
      despesas: 21033171.72,
      lucro_liquido: -526892.10,
      margem_liquida: -0.0024,
      alertas: ["lucro_negativo"],
      confianca: 0.95,
    },
  },
  {
    key: "nardelli",
    notes: `${SEED_TAG} Coligada Nardelli — Balancete 11/2024 (PDF, 6 colunas com sufixo D/C)`,
    input_text:
      `BALANCETE DE VERIFICAÇÃO — Período: 01/11/2024 a 30/11/2024\n` +
      `Código   Descrição                      Saldo Anterior        Débito          Crédito         Saldo Atual\n` +
      `1        ATIVO                          12.345.678,90 D       1.234.567,00    987.654,00      12.592.591,90 D\n` +
      `1.1      ATIVO CIRCULANTE               5.678.901,23 D        500.000,00      300.000,00      5.878.901,23 D\n` +
      `1.1.05   CRÉDITOS COM EMPRESAS LIGADAS  100.831.418,87 D      0,00            0,00            100.831.418,87 D\n` +
      `2        PASSIVO + PATRIMÔNIO LÍQUIDO   12.345.678,90 C       987.654,00      1.234.567,00    12.592.591,90 C\n` +
      `2.1      PASSIVO CIRCULANTE             3.000.000,00 C        200.000,00      300.000,00      3.100.000,00 C\n` +
      `2.3      PATRIMÔNIO LÍQUIDO             -50.000.000,00 D      0,00            150.000,00      -49.850.000,00 D\n` +
      `3        RESULTADO DO EXERCÍCIO         -149.850,00 D         50.000,00       0,00            -199.850,00 D`,
    output_correto: {
      layout: "nardelli",
      ativo_total: 12592591.90,
      passivo_total: 3100000.00,
      patrimonio_liquido: -49850000.00,
      resultado_periodo: -199850.00,
      receita_bruta: null,
      receita_liquida: null,
      custos: null,
      despesas: 50000.00,
      lucro_liquido: -199850.00,
      margem_liquida: null,
      alertas: ["lucro_negativo", "patrimonio_liquido_negativo"],
      confianca: 0.92,
    },
  },
];

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
    console.error("[seed] gemini embed failed", r.status, (await r.text()).slice(0, 300));
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
    console.error("[seed] gateway embed failed", r.status, (await r.text()).slice(0, 300));
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // GET: status
  if (req.method === "GET") {
    const r = await sb(
      `/dataset_validated?select=id,notes&classe=eq.BALANCETE&notes=like.${encodeURIComponent("%" + SEED_TAG + "%")}`,
    );
    const rows = await r.json();
    return new Response(
      JSON.stringify({ ok: true, seeded: rows?.length ?? 0, tag: SEED_TAG }),
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
    const results: Array<Record<string, unknown>> = [];
    for (const ex of EXAMPLES) {
      // Idempotência: pula se já existir validated com mesma notes
      const existResp = await sb(
        `/dataset_validated?select=id&classe=eq.BALANCETE&notes=eq.${encodeURIComponent(ex.notes)}&limit=1`,
      );
      const exist = await existResp.json();
      if (Array.isArray(exist) && exist.length > 0) {
        results.push({ key: ex.key, status: "skipped", reason: "already_seeded", id: exist[0].id });
        continue;
      }

      // 1) dataset_validated
      const dvResp = await sb(`/dataset_validated`, {
        method: "POST",
        body: JSON.stringify({
          classe: "BALANCETE",
          agent: "AGENTE_BALANCETE",
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

      // 2) embedding + prompt_examples
      const embedding = await embedText(ex.input_text);
      let exampleId: string | null = null;
      if (embedding && embedding.length === EMBED_DIMS) {
        const peResp = await sb(`/prompt_examples`, {
          method: "POST",
          body: JSON.stringify({
            validated_id: dv.id,
            classe: "BALANCETE",
            agent: "AGENTE_BALANCETE",
            input_text: ex.input_text.slice(0, 4000),
            output_json: ex.output_correto,
            embedding: `[${embedding.join(",")}]`,
            weight: 1.0,
            active: true,
          }),
        });
        if (peResp.ok) exampleId = (await peResp.json())?.[0]?.id ?? null;
        else console.error("[seed] prompt_examples insert failed:", await peResp.text());
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
      JSON.stringify({ ok: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("seed-balancete-examples error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
