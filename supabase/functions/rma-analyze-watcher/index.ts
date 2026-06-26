// rma-analyze-watcher: auto-resume de análises travadas.
// Critério: status='em_analise' e updated_at < now()-2min → dispara rma-analyze {force:true}.
// Também re-dispara 'consolidado' com percentual=0 (análise vazia).
// Idempotente. Cron a cada 1 min.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function fire(companyId: string, year: number, month: number) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/rma-analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ companyId, year, month, force: true }),
  });
  return { ok: r.ok, status: r.status, text: r.ok ? "" : (await r.text()).slice(0, 200) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    // Travados em_analise
    const { data: stuck } = await sb
      .from("rma_period_analyses")
      .select("company_id, year, month, status, percentual, updated_at")
      .eq("status", "em_analise")
      .lt("updated_at", cutoff);

    // Consolidados com percentual=0 (concluiu sem indicadores → re-dispara 1x)
    const { data: empty } = await sb
      .from("rma_period_analyses")
      .select("company_id, year, month, status, percentual, updated_at")
      .in("status", ["consolidado", "concluido"])
      .eq("percentual", 0)
      .lt("updated_at", cutoff);

    // Workspace: rma_analysis_results concluido com percentual=0 → re-dispara
    const { data: emptyWs } = await sb
      .from("rma_analysis_results")
      .select("company_id, status, percentual, updated_at")
      .in("status", ["concluido", "consolidado"])
      .eq("percentual", 0)
      .lt("updated_at", cutoff);

    // Workspace: em_analise travado
    const { data: stuckWs } = await sb
      .from("rma_analysis_results")
      .select("company_id, status, percentual, updated_at")
      .eq("status", "em_analise")
      .lt("updated_at", cutoff);

    // Busca year/month das companies para os workspace refires
    const wsRows = [...(emptyWs || []), ...(stuckWs || [])];
    const companyIds = Array.from(new Set(wsRows.map((r: any) => r.company_id)));
    const { data: companies } = companyIds.length
      ? await sb.from("companies").select("id, execution_year, current_period_month").in("id", companyIds)
      : { data: [] as any[] };
    const cmap = new Map((companies || []).map((c: any) => [c.id, c]));

    const all = [
      ...((stuck || []).map((r: any) => ({ company_id: r.company_id, year: r.year, month: r.month, source: "period_stuck" }))),
      ...((empty || []).map((r: any) => ({ company_id: r.company_id, year: r.year, month: r.month, source: "period_empty" }))),
      ...wsRows.map((r: any) => {
        const c: any = cmap.get(r.company_id);
        return { company_id: r.company_id, year: c?.execution_year, month: c?.current_period_month, source: "workspace" };
      }).filter((r: any) => r.year && r.month),
    ];

    // Deduplica por company+year+month
    const seen = new Set<string>();
    const dedup = all.filter((r: any) => {
      const k = `${r.company_id}|${r.year}|${r.month}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const results: any[] = [];
    for (const row of dedup) {
      const r = await fire(row.company_id, row.year, row.month);
      results.push({ company: row.company_id, year: row.year, month: row.month, source: row.source, ...r });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
