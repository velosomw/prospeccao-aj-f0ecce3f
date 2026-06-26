// consolidate-worker — Worker de Consolidação
// --------------------------------------------
// Pega dados estruturados (ai_extractions.extracted_data) de um documento,
// calcula indicadores financeiros, score Kanitz, BEx-RJ e gera o payload
// de relatório, persistindo em ai_extractions.partial_results.consolidation
// e (quando aplicável) em rma_period_analyses / rma_analysis_results.
//
// POST { document_id?: string, extraction_id?: string, persist?: boolean }
//
// Retorna o ConsolidationResult.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/onedrive.ts";
import { consolidate, type ConsolidationInput } from "../_shared/consolidation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  document_id?: string;
  extraction_id?: string;
  persist?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const persist = body.persist !== false; // default true
    if (!body.document_id && !body.extraction_id) {
      return new Response(JSON.stringify({ error: "document_id ou extraction_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = getServiceClient();

    // 1) Carrega extração mais recente concluída
    let q = sb
      .from("ai_extractions")
      .select("id, document_id, rma_id, classe, extracted_data, status, created_at, partial_results")
      .order("created_at", { ascending: false })
      .limit(1);
    if (body.extraction_id) q = q.eq("id", body.extraction_id);
    else q = q.eq("document_id", body.document_id!).eq("status", "completed");

    const { data: extractions, error: exErr } = await q;
    if (exErr) throw exErr;
    const ex = extractions?.[0];
    if (!ex) {
      return new Response(JSON.stringify({ error: "ai_extraction não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ex.extracted_data) {
      return new Response(JSON.stringify({ error: "extracted_data ausente — rode LLM primeiro" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Contexto: empresa + período
    let context: ConsolidationInput["context"] = {};
    if (ex.rma_id) {
      const { data: company } = await sb
        .from("companies")
        .select("id, name, execution_year, current_period_month")
        .eq("rma_id", ex.rma_id)
        .maybeSingle();
      if (company) {
        context = {
          empresa: company.name || undefined,
          rma_id: ex.rma_id,
          ano: (company as any).execution_year ?? undefined,
          mes: (company as any).current_period_month ?? undefined,
        };
      }
    }
    // Override de período via extracted_data se vier
    const ed: any = ex.extracted_data;
    if (ed?.periodo?.ano) context.ano = Number(ed.periodo.ano);
    if (ed?.periodo?.mes) context.mes = Number(ed.periodo.mes);

    // 3) Consolida (puro)
    const result = consolidate({
      classe: ex.classe || "DESCONHECIDO",
      extracted_data: ed,
      context,
    });

    if (!persist) {
      return new Response(JSON.stringify({ success: true, persisted: false, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Persiste em ai_extractions.partial_results.consolidation (não destrutivo)
    const newPartial = {
      ...(ex.partial_results || {}),
      consolidation: result,
    };
    await sb.from("ai_extractions").update({
      partial_results: newPartial,
      updated_at: new Date().toISOString(),
    }).eq("id", ex.id);

    // 5) Espelha em rma_period_analyses quando temos company + período
    let periodPersisted = false;
    if (ex.rma_id && context.ano && context.mes) {
      const { data: company } = await sb.from("companies").select("id").eq("rma_id", ex.rma_id).maybeSingle();
      if (company?.id) {
        const periodLabel = `${String(context.mes).padStart(2, "0")}/${context.ano}`;
        await sb.from("rma_period_analyses").upsert({
          company_id: company.id,
          year: context.ano,
          month: context.mes,
          period_label: periodLabel,
          status: "consolidado",
          indicadores: result.indicadores,
          kanitz: result.kanitz,
          score_rj: result.score_rj,
          alertas: result.alertas,
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,period_label" });
        periodPersisted = true;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      persisted: true,
      period_persisted: periodPersisted,
      extraction_id: ex.id,
      document_id: ex.document_id,
      result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("consolidate-worker error", e);
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
