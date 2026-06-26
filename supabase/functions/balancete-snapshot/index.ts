// supabase/functions/balancete-snapshot/index.ts
// Cria e restaura snapshots completos do Balancete + BS + DRE para um RMA.
// Ações:
//   POST { action: "create",  company_id, ano, mes, motivo? }
//   POST { action: "restore", snapshot_id, motivo? }
//   GET  ?company_id=...&ano=...&mes=...     -> lista snapshots
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";

  // Cliente do usuário (para checar identidade) e admin (para escrever snapshots).
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) return json(401, { error: "unauthorized" });
  const userId = userData.user.id;

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const company_id = url.searchParams.get("company_id");
      const ano = url.searchParams.get("ano");
      const mes = url.searchParams.get("mes");
      if (!company_id) return json(400, { error: "company_id required" });

      let q = admin
        .from("balancete_snapshots")
        .select("id, company_id, ano, mes, versao, motivo, origem, rows_balancete, rows_bs, rows_dre, created_by, created_at, restored_from")
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
    const action = body?.action as string;

    if (action === "create") {
      const { company_id, ano, mes, motivo } = body;
      if (!company_id || !ano || !mes) {
        return json(400, { error: "company_id, ano e mes obrigatórios" });
      }

      const [bal, bs, dre, comp] = await Promise.all([
        admin.from("balancete_consolidado")
          .select("*").eq("company_id", company_id).eq("ano", ano).eq("mes", mes),
        admin.from("bs_consolidado")
          .select("*").eq("company_id", company_id).eq("ano", ano).eq("mes", mes),
        admin.from("dre_consolidado")
          .select("*").eq("company_id", company_id).eq("ano", ano).eq("mes", mes),
        admin.from("companies").select("rma_id").eq("id", company_id).maybeSingle(),
      ]);
      if (bal.error || bs.error || dre.error) {
        return json(500, { error: bal.error?.message || bs.error?.message || dre.error?.message });
      }

      const { data: lastVer } = await admin
        .from("balancete_snapshots")
        .select("versao")
        .eq("company_id", company_id).eq("ano", ano).eq("mes", mes)
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      const versao = (lastVer?.versao ?? 0) + 1;

      const { data: snap, error: insErr } = await admin
        .from("balancete_snapshots")
        .insert({
          company_id, rma_id: comp.data?.rma_id ?? null,
          ano, mes, versao, scope: "mes",
          motivo: motivo || `Snapshot v${versao} de ${String(mes).padStart(2,"0")}/${ano}`,
          origem: "manual",
          rows_balancete: bal.data?.length ?? 0,
          rows_bs: bs.data?.length ?? 0,
          rows_dre: dre.data?.length ?? 0,
          payload: {
            balancete: bal.data ?? [],
            bs: bs.data ?? [],
            dre: dre.data ?? [],
          },
          created_by: userId,
        })
        .select("id, versao, rows_balancete, rows_bs, rows_dre")
        .single();
      if (insErr) return json(500, { error: insErr.message });
      return json(200, { ok: true, snapshot: snap });
    }

    if (action === "restore") {
      const { snapshot_id, motivo } = body;
      if (!snapshot_id) return json(400, { error: "snapshot_id obrigatório" });

      const { data: snap, error: snapErr } = await admin
        .from("balancete_snapshots")
        .select("*")
        .eq("id", snapshot_id).maybeSingle();
      if (snapErr || !snap) return json(404, { error: "snapshot não encontrado" });

      // Snapshot de segurança ANTES da restauração
      const [curBal, curBs, curDre] = await Promise.all([
        admin.from("balancete_consolidado").select("*")
          .eq("company_id", snap.company_id).eq("ano", snap.ano).eq("mes", snap.mes),
        admin.from("bs_consolidado").select("*")
          .eq("company_id", snap.company_id).eq("ano", snap.ano).eq("mes", snap.mes),
        admin.from("dre_consolidado").select("*")
          .eq("company_id", snap.company_id).eq("ano", snap.ano).eq("mes", snap.mes),
      ]);
      const { data: lastVer } = await admin
        .from("balancete_snapshots")
        .select("versao")
        .eq("company_id", snap.company_id).eq("ano", snap.ano).eq("mes", snap.mes)
        .order("versao", { ascending: false }).limit(1).maybeSingle();
      const safetyVersao = (lastVer?.versao ?? 0) + 1;
      await admin.from("balancete_snapshots").insert({
        company_id: snap.company_id, rma_id: snap.rma_id,
        ano: snap.ano, mes: snap.mes, versao: safetyVersao,
        scope: "mes",
        motivo: `[auto-safety] pré-rollback p/ versão v${snap.versao}`,
        origem: "auto_pre_restore",
        rows_balancete: curBal.data?.length ?? 0,
        rows_bs: curBs.data?.length ?? 0,
        rows_dre: curDre.data?.length ?? 0,
        payload: { balancete: curBal.data ?? [], bs: curBs.data ?? [], dre: curDre.data ?? [] },
        created_by: userId,
      });

      // Substitui dados do mês pelos do snapshot
      const filter = { company_id: snap.company_id, ano: snap.ano, mes: snap.mes };
      await admin.from("balancete_consolidado").delete().match(filter);
      await admin.from("bs_consolidado").delete().match(filter);
      await admin.from("dre_consolidado").delete().match(filter);

      const stripIds = (rows: any[]) =>
        (rows ?? []).map(({ id, created_at, updated_at, ...rest }) => rest);

      const balRows = stripIds(snap.payload?.balancete);
      const bsRows = stripIds(snap.payload?.bs);
      const dreRows = stripIds(snap.payload?.dre);

      const errors: string[] = [];
      if (balRows.length) {
        const { error } = await admin.from("balancete_consolidado").insert(balRows);
        if (error) errors.push(`balancete: ${error.message}`);
      }
      if (bsRows.length) {
        const { error } = await admin.from("bs_consolidado").insert(bsRows);
        if (error) errors.push(`bs: ${error.message}`);
      }
      if (dreRows.length) {
        const { error } = await admin.from("dre_consolidado").insert(dreRows);
        if (error) errors.push(`dre: ${error.message}`);
      }

      // Marca o snapshot atual com restored_from -> snap.id (rastro)
      await admin.from("balancete_snapshots")
        .update({ restored_from: snap.id, motivo: motivo || `Rollback aplicado para v${snap.versao}` })
        .eq("company_id", snap.company_id)
        .eq("ano", snap.ano).eq("mes", snap.mes)
        .eq("versao", safetyVersao);

      if (errors.length) return json(207, { ok: true, warnings: errors });
      return json(200, {
        ok: true,
        restored: { snapshot_id, versao: snap.versao },
        safety_snapshot_versao: safetyVersao,
        rows: { balancete: balRows.length, bs: bsRows.length, dre: dreRows.length },
      });
    }

    return json(400, { error: "action inválida (create|restore)" });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
});
