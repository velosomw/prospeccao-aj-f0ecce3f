// ============================================================
// pivotConsolidado.ts — leitura pivotada de balancete_consolidado
// (código contábil × mês) para auditoria folha-a-folha estilo XLSX.
// Também expõe validação Ativo = Passivo + PL por mês a partir
// dos próprios dados persistidos (single source of truth).
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface PivotRow {
  codigo: string | null;
  conta: string;
  descricao: string;
  tipo: string | null;       // ativo/passivo/patrimonio_liquido/receita/despesa
  grupo: string | null;
  subgrupo: string | null;
  values: Record<string, number>; // mesKey "YYYY-MM" → saldo
}

export interface PivotEquilibrio {
  mesKey: string;            // "YYYY-MM"
  ativo: number;
  passivo: number;
  patrimonio_liquido: number;
  diff: number;              // |A - (P + PL)|
  diff_pct: number;
  ok: boolean;               // diff_pct <= 0.005
}

export interface PivotConsolidadoResult {
  rows: PivotRow[];
  mesKeys: string[];         // ordenados asc
  equilibrio: PivotEquilibrio[];
}

const TOLERANCIA = 0.005; // 0,5%

function mesKey(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/**
 * Lê balancete_consolidado e devolve a visão pivot (código × mês),
 * usando Saldo Atual como fonte de verdade (fallback: valor).
 * Replica o XLSX-alvo de N meses exigido pela auditoria.
 */
export async function fetchPivotConsolidado(
  companyId: string,
  opts: { ano?: number; minMes?: number; maxMes?: number } = {},
): Promise<PivotConsolidadoResult> {
  let q = supabase
    .from("balancete_consolidado")
    .select("codigo, conta, descricao, tipo, grupo, subgrupo, ano, mes, valor, saldo")
    .eq("company_id", companyId)
    .order("ano", { ascending: true })
    .order("mes", { ascending: true });

  if (opts.ano != null) q = q.eq("ano", opts.ano);
  if (opts.minMes != null) q = q.gte("mes", opts.minMes);
  if (opts.maxMes != null) q = q.lte("mes", opts.maxMes);

  const { data, error } = await q;
  if (error) throw new Error(`fetchPivotConsolidado: ${error.message}`);

  const mesSet = new Set<string>();
  const byKey = new Map<string, PivotRow>();

  for (const r of (data || []) as any[]) {
    const mk = mesKey(Number(r.ano), Number(r.mes));
    mesSet.add(mk);
    const codigo = r.codigo && /^\d+$/.test(String(r.codigo).trim())
      ? String(r.codigo).trim()
      : null;
    const chave = codigo || r.conta;
    let row = byKey.get(chave);
    if (!row) {
      row = {
        codigo,
        conta: r.conta,
        descricao: r.descricao,
        tipo: r.tipo ?? null,
        grupo: r.grupo ?? null,
        subgrupo: r.subgrupo ?? null,
        values: {},
      };
      byKey.set(chave, row);
    }
    // Saldo Atual (BEx) tem prioridade; fallback para `valor` (legado)
    const v = r.saldo != null && Number.isFinite(Number(r.saldo))
      ? Number(r.saldo)
      : Number(r.valor || 0);
    row.values[mk] = (row.values[mk] || 0) + v;
  }

  const mesKeys = Array.from(mesSet).sort();
  const rows = Array.from(byKey.values()).sort((a, b) => {
    const ca = a.codigo || a.conta;
    const cb = b.codigo || b.conta;
    return ca.localeCompare(cb);
  });

  // Validação A = P + PL por mês
  const equilibrio: PivotEquilibrio[] = mesKeys.map(mk => {
    let ativo = 0, passivo = 0, pl = 0;
    for (const r of rows) {
      const v = Number(r.values[mk] || 0);
      if (!v) continue;
      const c = r.codigo || "";
      const tipo = r.tipo;
      // Classificação determinística por prefixo (BEx) com fallback ao tipo
      if (c.startsWith("1") || tipo === "ativo") ativo += Math.abs(v);
      else if (c.startsWith("2") || tipo === "passivo") passivo += Math.abs(v);
      else if (c.startsWith("3") || tipo === "patrimonio_liquido") pl += v;
    }
    const passivoMaisPL = passivo + pl;
    const diff = Math.abs(ativo - passivoMaisPL);
    const base = Math.max(ativo, passivoMaisPL, 1);
    const diffPct = diff / base;
    return {
      mesKey: mk,
      ativo,
      passivo,
      patrimonio_liquido: pl,
      diff,
      diff_pct: diffPct,
      ok: diffPct <= TOLERANCIA,
    };
  });

  return { rows, mesKeys, equilibrio };
}
