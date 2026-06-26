// monitor-onedrive — Phase 1 agent
// Scans OneDrive for all active companies/periods, detects deltas
// via the Delta Engine, and enqueues only new/updated files.
//
// Triggered manually or by a cron. Idempotent: safe to call repeatedly.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { audit, getServiceClient } from "../_shared/onedrive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Share link fixo da raiz "Projeto RMA" (mesmo usado em onedrive-poll-entradas).
// Necessário porque a pasta vive no OneDrive de outro usuário e não está
// na raiz do drive da conta de serviço.
const DEFAULT_SHARE_URL =
  "https://bexonedrive-my.sharepoint.com/:f:/g/personal/tecnico_brasilexpert_com_br/IgA6tcBZSKW9Qq9kqTMlHODwAWn9lmWTkQNwh_kj1yOvzxA";

async function syncOne(input: {
  rmaId: string;
  companyId: string;
  clientName: string;
  year: number;
  month: number | null;
  scanId: string;
  shareUrl: string;
}) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${url}/functions/v1/onedrive-sync-rma`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key!,
      "x-scan-id": input.scanId,
    },
    body: JSON.stringify({ ...input, scanId: input.scanId }),
  });
  return await r.json().catch(() => ({}));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const {
      companyIds = null, // optional list to scope the run
      year = new Date().getFullYear(),
      month = new Date().getMonth() + 1,
      onlyActive = true,
      shareUrl = DEFAULT_SHARE_URL,
    } = body;

    const sb = getServiceClient();
    let q = sb
      .from("companies")
      .select("id,name,rma_id,period_active,current_period_month,execution_year,auto_monthly");

    if (companyIds && Array.isArray(companyIds) && companyIds.length > 0) {
      q = q.in("id", companyIds);
    } else if (onlyActive) {
      q = q.eq("period_active", true);
    }

    const { data: companies, error } = await q;
    if (error) throw error;

    const results: any[] = [];
    for (const c of companies ?? []) {
      const targetYear = c.execution_year ?? Number(year);
      const targetMonth = c.current_period_month ?? Number(month);
      const scanId = crypto.randomUUID();
      try {
        const r = await syncOne({
          rmaId: c.rma_id ?? `RMA-${c.id.slice(0, 8)}`,
          companyId: c.id,
          clientName: c.name,
          year: targetYear,
          month: targetMonth,
          scanId,
          shareUrl,
        });
        results.push({
          company_id: c.id,
          name: c.name,
          year: targetYear,
          month: targetMonth,
          summary: r?.summary ?? null,
          ok: !!r?.success,
          error: r?.error ?? null,
        });
      } catch (e) {
        results.push({
          company_id: c.id,
          name: c.name,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const totals = results.reduce(
      (acc, r) => {
        acc.new += r.summary?.new ?? 0;
        acc.updated += r.summary?.updated ?? 0;
        acc.ignored += r.summary?.ignored ?? 0;
        acc.invalid += r.summary?.invalid ?? 0;
        return acc;
      },
      { new: 0, updated: 0, ignored: 0, invalid: 0 },
    );

    await audit({
      documentId: null,
      step: "monitor_onedrive",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: { companies_scanned: results.length, totals },
    });

    return new Response(JSON.stringify({
      success: true,
      companies_scanned: results.length,
      totals,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("monitor-onedrive error", e);
    await audit({
      documentId: null,
      step: "monitor_onedrive",
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
