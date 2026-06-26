// rma-period-chain: dispatcher sequencial de análises mensais.
//
// Modos:
//  1) seed: { companyId, periods: [{year,month}, ...] }
//     → cria/atualiza a fila em rma_period_chain e dispara o primeiro item pending.
//  2) tick: { companyId } (ou sem body, processa todas as filas ativas)
//     → para cada empresa com fila aberta:
//        - se o item 'triggered' atual está concluído → marca done, dispara o próximo.
//        - se está em erro → marca erro e para.
//        - se está em_analise → não faz nada.
//
// É idempotente. Pode ser invocado por cron (a cada 1-2 min) ou manualmente.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function periodLabel(y: number, m: number) {
  return `${String(m).padStart(2, "0")}-${y}`;
}

async function triggerAnalyze(companyId: string, year: number, month: number) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/rma-analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ companyId, year, month, force: true }),
  });
  return { ok: r.ok, status: r.status, text: r.ok ? "" : await r.text() };
}

async function getPeriodStatus(
  sb: ReturnType<typeof createClient>,
  companyId: string,
  year: number,
  month: number,
) {
  const { data } = await sb
    .from("rma_period_analyses")
    .select("status, finished_at")
    .eq("company_id", companyId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  return (data as any) || null;
}

async function processCompany(
  sb: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data: items, error } = await sb
    .from("rma_period_chain")
    .select("*")
    .eq("company_id", companyId)
    .order("sequence_order", { ascending: true });
  if (error) throw error;
  if (!items?.length) return { companyId, action: "no_queue" };

  const log: string[] = [];

  // 1) Verifica item triggered atual
  const triggered = (items as any[]).find((i) => i.status === "triggered");
  if (triggered) {
    const p = await getPeriodStatus(sb, companyId, triggered.year, triggered.month);
    await sb
      .from("rma_period_chain")
      .update({ last_check_at: new Date().toISOString() })
      .eq("id", triggered.id);

    if (!p) {
      log.push(`[${periodLabel(triggered.year, triggered.month)}] sem registro ainda em rma_period_analyses`);
      return { companyId, action: "waiting", log };
    }
    if (p.status === "concluido" || p.status === "consolidado") {
      await sb
        .from("rma_period_chain")
        .update({ status: "done", finished_at: p.finished_at || new Date().toISOString() })
        .eq("id", triggered.id);
      log.push(`[${periodLabel(triggered.year, triggered.month)}] ${p.status} → próximo`);
    } else if (p.status === "erro") {
      await sb
        .from("rma_period_chain")
        .update({ status: "erro", finished_at: p.finished_at || new Date().toISOString(), notes: "rma_period_analyses=erro" })
        .eq("id", triggered.id);
      log.push(`[${periodLabel(triggered.year, triggered.month)}] erro — interrompendo cadeia`);
      return { companyId, action: "error", log };
    } else {
      log.push(`[${periodLabel(triggered.year, triggered.month)}] ainda em_analise — aguardando`);
      return { companyId, action: "in_progress", log };
    }
  }

  // 2) Próximo pending
  const next = (items as any[])
    .filter((i) => i.status === "pending")
    .sort((a, b) => a.sequence_order - b.sequence_order)[0];
  if (!next) {
    log.push("cadeia completa");
    return { companyId, action: "done", log };
  }

  // Atualiza empresa para refletir o novo período corrente
  await sb.from("companies").update({
    execution_year: next.year,
    current_period_month: next.month,
    period_active: true,
  }).eq("id", companyId);

  const r = await triggerAnalyze(companyId, next.year, next.month);
  if (!r.ok) {
    log.push(`falha ao disparar ${periodLabel(next.year, next.month)}: ${r.status} ${r.text.slice(0, 200)}`);
    await sb
      .from("rma_period_chain")
      .update({ notes: `trigger_failed: ${r.status}`, last_check_at: new Date().toISOString() })
      .eq("id", next.id);
    return { companyId, action: "trigger_failed", log };
  }

  await sb
    .from("rma_period_chain")
    .update({ status: "triggered", triggered_at: new Date().toISOString(), last_check_at: new Date().toISOString() })
    .eq("id", next.id);

  log.push(`disparado ${periodLabel(next.year, next.month)}`);
  return { companyId, action: "triggered", period: periodLabel(next.year, next.month), log };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const { companyId, periods, mode } = body as {
      companyId?: string;
      periods?: { year: number; month: number }[];
      mode?: "seed" | "tick";
    };

    // SEED ── popula a fila para uma empresa
    if (periods && periods.length && companyId) {
      const rows = periods.map((p, idx) => ({
        company_id: companyId,
        year: p.year,
        month: p.month,
        sequence_order: idx + 1,
        status: "pending",
      }));
      const { error: upErr } = await sb
        .from("rma_period_chain")
        .upsert(rows, { onConflict: "company_id,year,month", ignoreDuplicates: false });
      if (upErr) throw upErr;

      const r = await processCompany(sb, companyId);
      return new Response(JSON.stringify({ ok: true, seeded: rows.length, ...r }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TICK explícito de uma empresa
    if (companyId) {
      const r = await processCompany(sb, companyId);
      return new Response(JSON.stringify({ ok: true, ...r }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TICK global: percorre empresas com fila ainda ativa
    const { data: active } = await sb
      .from("rma_period_chain")
      .select("company_id")
      .in("status", ["pending", "triggered"]);
    const uniqueIds = Array.from(new Set((active || []).map((r: any) => r.company_id)));
    const results = [];
    for (const cid of uniqueIds) {
      try {
        results.push(await processCompany(sb, cid));
      } catch (e) {
        results.push({ companyId: cid, error: (e as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: uniqueIds.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
