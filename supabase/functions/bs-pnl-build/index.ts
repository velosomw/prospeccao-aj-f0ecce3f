// ============================================================
// bs-pnl-build — Deriva Balanço Patrimonial (BS) e DRE
// a partir de balancete_consolidado por classificação de prefixo.
//
// Regras (MD Estruturação Workspaces Financeiros):
//  - Prefixo 1xxxx → Ativo (11=Circulante, 12=Não Circulante)
//  - Prefixo 2xxxx → Passivo (21=Circulante, 22=Não Circulante)
//  - Prefixo 3xxxx → Patrimônio Líquido
//  - Prefixo 4xxxx → Receita / Deduções
//  - Prefixo 5xxxx → Custos / Despesas
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BuildBody {
  company_id: string;
  ano?: number;
  mes?: number;
  months_back?: number; // default 6
}

type Secao = "ativo" | "passivo" | "pl";
type Grupo = "circulante" | "nao_circulante" | "patrimonio_liquido";

function classifyBS(codigo: string): { secao: Secao; grupo: Grupo } | null {
  const c = (codigo || "").replace(/\D/g, "");
  if (!c) return null;
  if (c.startsWith("11")) return { secao: "ativo", grupo: "circulante" };
  if (c.startsWith("12")) return { secao: "ativo", grupo: "nao_circulante" };
  if (c.startsWith("21")) return { secao: "passivo", grupo: "circulante" };
  if (c.startsWith("22")) return { secao: "passivo", grupo: "nao_circulante" };
  if (c.startsWith("3"))  return { secao: "pl",      grupo: "patrimonio_liquido" };
  if (c.startsWith("1"))  return { secao: "ativo",   grupo: "circulante" };
  if (c.startsWith("2"))  return { secao: "passivo", grupo: "circulante" };
  return null;
}

function classifyDRE(codigo: string, descricao: string): string | null {
  const c = (codigo || "").replace(/\D/g, "");
  const d = (descricao || "").toLowerCase();
  if (c.startsWith("41") || /receita\s+bruta|venda/.test(d)) return "receita_bruta";
  if (c.startsWith("42") || /dedu|imposto.*venda|cancelamento|devolu/.test(d)) return "deducoes";
  if (c.startsWith("51") || /\bcmv\b|custo.*(mercador|servi|produ)/.test(d)) return "custos";
  if (c.startsWith("52") || c.startsWith("53") || /despesa/.test(d)) return "despesas_operacionais";
  if (c.startsWith("54") || /deprecia/.test(d)) return "depreciacao";
  if (c.startsWith("55") || /amortiza/.test(d)) return "amortizacao";
  if (c.startsWith("56") || /financeir/.test(d)) return "resultado_financeiro";
  if (c.startsWith("57") || /imposto.*renda|csll|irpj/.test(d)) return "impostos";
  if (c.startsWith("4")) return "receita_bruta";
  if (c.startsWith("5")) return "despesas_operacionais";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as BuildBody;
    if (!body?.company_id) {
      return new Response(JSON.stringify({ error: "company_id obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Buscar empresa (rma_id)
    const { data: company } = await supa.from("companies")
      .select("rma_id").eq("id", body.company_id).maybeSingle();
    const rma_id = company?.rma_id ?? null;

    // Buscar balancete consolidado
    const { data: rows, error } = await supa.from("balancete_consolidado")
      .select("conta, codigo, descricao, tipo, nivel, ano, mes, valor, saldo")
      .eq("company_id", body.company_id)
      .order("ano", { ascending: true })
      .order("mes", { ascending: true });

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, bs: 0, dre: 0, message: "sem balancete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filtra por janela (últimos N meses ou competência específica)
    const monthsBack = body.months_back ?? 6;
    let filtered = rows;
    if (body.ano && body.mes) {
      filtered = rows.filter(r => r.ano === body.ano && r.mes === body.mes);
    } else {
      // últimos N períodos distintos
      const periods = Array.from(new Set(rows.map(r => `${r.ano}-${String(r.mes).padStart(2, "0")}`))).sort();
      const lastN = new Set(periods.slice(-monthsBack));
      filtered = rows.filter(r => lastN.has(`${r.ano}-${String(r.mes).padStart(2, "0")}`));
    }

    // ─── Construir BS ───
    const bsRows: any[] = [];
    const dreRows: any[] = [];

    for (const r of filtered) {
      const valor = Number(r.saldo ?? r.valor ?? 0);
      if (!Number.isFinite(valor) || valor === 0) continue;
      const codigo = String(r.codigo || r.conta || "").trim();
      if (!codigo) continue;

      const bs = classifyBS(codigo);
      if (bs) {
        bsRows.push({
          company_id: body.company_id,
          rma_id,
          ano: r.ano,
          mes: r.mes,
          secao: bs.secao,
          grupo: bs.grupo,
          codigo,
          descricao: r.descricao || codigo,
          nivel: r.nivel ?? Math.min(5, Math.ceil(codigo.length / 2)),
          valor: bs.secao === "passivo" || bs.secao === "pl" ? Math.abs(valor) : Math.abs(valor),
          fonte: "balancete_consolidado",
        });
      }

      const cat = classifyDRE(codigo, r.descricao || "");
      if (cat) {
        dreRows.push({
          company_id: body.company_id,
          rma_id,
          ano: r.ano,
          mes: r.mes,
          codigo,
          descricao: r.descricao || codigo,
          tipo: r.tipo || (cat === "receita_bruta" ? "receita" : "despesa"),
          nivel: r.nivel ?? Math.min(5, Math.ceil(codigo.length / 2)),
          valor: cat === "receita_bruta" ? Math.abs(valor) : -Math.abs(valor),
          saldo: cat === "receita_bruta" ? Math.abs(valor) : -Math.abs(valor),
          // categoria lógica codificada em "grupo" (campo já existente em dre_consolidado)
          grupo: cat,
          subgrupo: cat,
        });
      }
    }

    // ─── Calcular AV% (Ativo Total = 100% para BS; Receita Líquida = 100% para DRE) por período ───
    const bsByPeriod = new Map<string, any[]>();
    for (const b of bsRows) {
      const k = `${b.ano}-${b.mes}`;
      if (!bsByPeriod.has(k)) bsByPeriod.set(k, []);
      bsByPeriod.get(k)!.push(b);
    }
    for (const [, list] of bsByPeriod) {
      const ativoTotal = list.filter(x => x.secao === "ativo" && x.nivel <= 2)
        .reduce((s, x) => s + Number(x.valor || 0), 0) || 1;
      list.forEach(x => { x.av_pct = Number((Math.abs(x.valor) / ativoTotal).toFixed(6)); });
    }

    // ─── Persistir (upsert) ───
    if (bsRows.length > 0) {
      const { error: e1 } = await supa.from("bs_consolidado").upsert(bsRows, {
        onConflict: "company_id,ano,mes,codigo,secao",
      });
      if (e1) throw e1;
    }
    if (dreRows.length > 0) {
      const { error: e2 } = await supa.from("dre_consolidado").upsert(dreRows, {
        onConflict: "company_id,ano,mes,codigo",
      });
      if (e2) console.error("[dre upsert] não-fatal:", e2.message);
    }

    return new Response(JSON.stringify({
      ok: true,
      bs: bsRows.length,
      dre: dreRows.length,
      periods: Array.from(bsByPeriod.keys()),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("[bs-pnl-build] erro:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
