// Hook que carrega BS e DRE consolidados por empresa e competência.
// Aceita um período global (ano/mes) opcional ou retorna últimos N meses.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase-any";

export interface BSRow {
  id: string;
  ano: number;
  mes: number;
  secao: "ativo" | "passivo" | "pl";
  grupo: "circulante" | "nao_circulante" | "patrimonio_liquido" | null;
  codigo: string;
  descricao: string;
  nivel: number;
  valor: number;
  av_pct: number | null;
  ah_pct: number | null;
}

export interface DRERow {
  id: string;
  ano: number;
  mes: number;
  codigo: string;
  descricao: string;
  grupo: string | null; // categoria lógica
  valor: number;
  nivel: number;
}

export interface JanelaRange {
  from: { ano: number; mes: number };
  to: { ano: number; mes: number };
}

export function useBSPNL(
  companyId: string | null,
  periodoFiltro?: { ano: number; mes: number } | null,
  monthsBack: number = 6,
  refreshKey?: string | number,
  janela?: JanelaRange | null,
) {
  const [bs, setBs] = useState<BSRow[]>([]);
  const [dre, setDre] = useState<DRERow[]>([]);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setBs([]); setDre([]); return; }
    setLoading(true);
    try {
      const [bsRes, dreRes] = await Promise.all([
        supabase.from("bs_consolidado")
          .select("id, ano, mes, secao, grupo, codigo, descricao, nivel, valor, av_pct, ah_pct")
          .eq("company_id", companyId)
          .order("ano", { ascending: false })
          .order("mes", { ascending: false })
          .order("codigo", { ascending: true }),
        supabase.from("dre_consolidado")
          .select("id, ano, mes, codigo, descricao, grupo, valor, nivel")
          .eq("company_id", companyId)
          .order("ano", { ascending: false })
          .order("mes", { ascending: false })
          .order("codigo", { ascending: true }),
      ]);
      setBs((bsRes.data as any) || []);
      setDre((dreRes.data as any) || []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const build = useCallback(async () => {
    if (!companyId) return;
    setBuilding(true);
    try {
      await supabase.functions.invoke("bs-pnl-build", {
        body: { company_id: companyId, months_back: monthsBack },
      });
      await load();
    } finally {
      setBuilding(false);
    }
  }, [companyId, monthsBack, load]);

  // Filtro:
  // - Se uma `janela` (intervalo) foi fornecida, usa o intervalo (3M/6M/12M).
  // - Senão, se houver `periodoFiltro` (mês único), usa só ele.
  const inJanela = (a: number, m: number) => {
    if (!janela) return true;
    const k = `${a}-${String(m).padStart(2, "0")}`;
    const fk = `${janela.from.ano}-${String(janela.from.mes).padStart(2, "0")}`;
    const tk = `${janela.to.ano}-${String(janela.to.mes).padStart(2, "0")}`;
    return k >= fk && k <= tk;
  };
  const bsFiltered = janela
    ? bs.filter(r => inJanela(r.ano, r.mes))
    : periodoFiltro
      ? bs.filter(r => r.ano === periodoFiltro.ano && r.mes === periodoFiltro.mes)
      : bs;
  const dreFiltered = janela
    ? dre.filter(r => inJanela(r.ano, r.mes))
    : periodoFiltro
      ? dre.filter(r => r.ano === periodoFiltro.ano && r.mes === periodoFiltro.mes)
      : dre;

  // Períodos disponíveis
  const periodos = Array.from(new Set(bs.map(r => `${r.ano}-${String(r.mes).padStart(2, "0")}`)))
    .sort()
    .map(p => {
      const [a, m] = p.split("-").map(Number);
      return { ano: a, mes: m, label: p };
    });

  return { bs: bsFiltered, dre: dreFiltered, allBs: bs, allDre: dre, periodos, loading, building, build, reload: load };
}
