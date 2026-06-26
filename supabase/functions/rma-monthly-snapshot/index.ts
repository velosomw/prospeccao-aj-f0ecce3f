// Cria e lista snapshots mensais consolidados do RMA (Balancete + BS + DRE + Alertas).
// POST { action: "create", company_id, ano, mes, motivo? }
// GET  ?company_id=...&ano=...&mes=...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: ud, error: aerr } = await userClient.auth.getUser();
  if (aerr || !ud?.user) return json(401, { error: "unauthorized" });
  const userId = ud.user.id;

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const company_id = url.searchParams.get("company_id");
      const ano = url.searchParams.get("ano");
      const mes = url.searchParams.get("mes");
      if (!company_id) return json(400, { error: "company_id required" });
      let q = admin
        .from("rma_monthly_snapshots")
        .select("*")
        .eq("company_id", company_id)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .order("versao", { ascending: false });
      if (ano) q = q.eq("ano", Number(ano));
      if (mes) q = q.eq("mes", Number(mes));
      const { data, error } = await q;
      if (error) return json(500, { error: error.message });
      return json(200, { snapshots: data ?? [] });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.action !== "create") return json(400, { error: "action inválida" });
    const { company_id, ano, mes, motivo } = body;
    if (!company_id || !ano || !mes) return json(400, { error: "company_id, ano e mes obrigatórios" });

    const [bal, bs, dre, alerts, comp, rma] = await Promise.all([
      admin.from("balancete_consolidado").select("*").eq("company_id", company_id).eq("ano", ano).eq("mes", mes),
      admin.from("bs_consolidado").select("*").eq("company_id", company_id).eq("ano", ano).eq("mes", mes),
      admin.from("dre_consolidado").select("*").eq("company_id", company_id).eq("ano", ano).eq("mes", mes),
      admin.from("financial_alerts").select("*").eq("company_id", company_id).eq("ano", ano).eq("mes", mes).order("created_at", { ascending: false }).limit(50),
      admin.from("companies").select("rma_id, name").eq("id", company_id).maybeSingle(),
      admin.from("rma_analysis_results").select("percentual, indicadores, kanitz, score_rj").eq("company_id", company_id).maybeSingle(),
    ]);
    if (bal.error || bs.error || dre.error) {
      return json(500, { error: bal.error?.message || bs.error?.message || dre.error?.message });
    }

    const { data: lastVer } = await admin
      .from("rma_monthly_snapshots")
      .select("versao")
      .eq("company_id", company_id).eq("ano", ano).eq("mes", mes)
      .order("versao", { ascending: false }).limit(1).maybeSingle();
    const versao = (lastVer?.versao ?? 0) + 1;

    // Resumo agregado para a tela de histórico
    const sum = (rows: any[], col: string) =>
      (rows || []).reduce((s, r) => s + (Number(r?.[col]) || 0), 0);
    const resumo = {
      empresa: comp.data?.name ?? null,
      total_ativo: sum(bs.data || [], "saldo_atual"),
      receita: sum((dre.data || []).filter((r: any) => r?.grupo === "receita"), "valor"),
      ebitda: null as number | null,
      alertas_bad: (alerts.data || []).filter((a: any) => a.severidade === "bad").length,
      alertas_warn: (alerts.data || []).filter((a: any) => a.severidade === "warn").length,
    };

    const { data: snap, error: insErr } = await admin
      .from("rma_monthly_snapshots")
      .insert({
        company_id,
        rma_id: comp.data?.rma_id ?? null,
        ano, mes, versao,
        motivo: motivo || `Snapshot mensal v${versao} de ${String(mes).padStart(2,"0")}/${ano}`,
        origem: "manual",
        rows_balancete: bal.data?.length ?? 0,
        rows_bs: bs.data?.length ?? 0,
        rows_dre: dre.data?.length ?? 0,
        alerts_count: alerts.data?.length ?? 0,
        percentual: rma.data?.percentual ?? 0,
        payload: {
          balancete: bal.data ?? [],
          bs: bs.data ?? [],
          dre: dre.data ?? [],
          alertas: alerts.data ?? [],
          indicadores: rma.data?.indicadores ?? null,
          kanitz: rma.data?.kanitz ?? null,
          score_rj: rma.data?.score_rj ?? null,
        },
        resumo,
        created_by: userId,
      })
      .select("*").single();
    if (insErr) return json(500, { error: insErr.message });

    return json(200, { ok: true, snapshot: snap });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
});
