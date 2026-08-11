// Hook que carrega Fluxo de Caixa consolidado (`fluxo_caixa_consolidado`)
// populado automaticamente pelo edge `balancete-build` (F3 do MD de reformulação).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-any";

export interface FCXRow {
  id: string;
  ano: number;
  mes: number;
  categoria: string;          // operacional | investimento | financiamento | caixa_inicial | caixa_final
  subcategoria: string | null;
  descricao: string;
  tipo: string;               // entrada | saida | saldo
  valor: number;
  entradas: number;
  saidas: number;
  saldo: number;
  qtd_lancamentos: number;
  confianca_global: number | null;
}

export interface JanelaRange {
  from: { ano: number; mes: number };
  to: { ano: number; mes: number };
}

export function useFluxoCaixa(
  companyId: string | null,
  periodoFiltro?: { ano: number; mes: number } | null,
  refreshKey?: string | number,
  janela?: JanelaRange | null,
) {
  const [rows, setRows] = useState<FCXRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setRows([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("fluxo_caixa_consolidado")
        .select("id, ano, mes, categoria, subcategoria, descricao, tipo, valor, entradas, saidas, saldo, qtd_lancamentos, confianca_global")
        .eq("company_id", companyId)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false });
      setRows((data as any) || []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const inJanela = (a: number, m: number) => {
    if (!janela) return true;
    const k = `${a}-${String(m).padStart(2, "0")}`;
    const fk = `${janela.from.ano}-${String(janela.from.mes).padStart(2, "0")}`;
    const tk = `${janela.to.ano}-${String(janela.to.mes).padStart(2, "0")}`;
    return k >= fk && k <= tk;
  };
  const filtered = janela
    ? rows.filter(r => inJanela(r.ano, r.mes))
    : periodoFiltro
      ? rows.filter(r => r.ano === periodoFiltro.ano && r.mes === periodoFiltro.mes)
      : rows;

  return { rows: filtered, allRows: rows, loading, reload: load };
}
