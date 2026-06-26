// rma-monthly-cycle: agendado para rodar diariamente. No dia 1º de cada mês,
// para cada empresa com auto_monthly=true, atualiza o período corrente
// (mês/ano), marca period_active=true e dispara a análise IA. Nos demais dias,
// apenas verifica se algum RMA ainda não tem snapshot do mês corrente.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const periodLabel = `${String(month).padStart(2, "0")}-${year}`;

    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    // Lista empresas com leitura mensal automática habilitada
    const { data: companies, error } = await sb
      .from("companies")
      .select("id, name, last_analyzed_period, auto_monthly, status")
      .eq("auto_monthly", true)
      .neq("status", "pendente_ativacao");
    if (error) throw error;

    const triggered: string[] = [];
    const skipped: string[] = [];

    for (const c of companies || []) {
      const isFirstDay = day === 1;
      const needsRun = c.last_analyzed_period !== periodLabel;
      if (!force && !isFirstDay && !needsRun) {
        skipped.push(c.id);
        continue;
      }

      // Atualiza estado da empresa para o novo período
      await sb.from("companies").update({
        execution_year: year,
        current_period_month: month,
        period_active: true,
      }).eq("id", c.id);

      // Dispara análise IA
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/rma-analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({ companyId: c.id, year, month }),
        });
        if (r.ok) triggered.push(c.id);
        else skipped.push(c.id);
      } catch {
        skipped.push(c.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        period: periodLabel,
        triggered: triggered.length,
        skipped: skipped.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
