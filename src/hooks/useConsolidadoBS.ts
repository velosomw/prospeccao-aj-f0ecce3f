// Hook que carrega balancete_consolidado da empresa e converte em ParsedFinancialData.
// v2 — Realtime: assina mudanças em balancete_consolidado / lancamentos / bs_consolidado /
// dre_consolidado / fluxo_caixa_consolidado / balancete_runs por company_id e refaz o
// build à medida que dados chegam do OneDrive ou de uploads manuais (acumulação ao vivo).
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase-any";
import { consolidadoToParsed } from "@/services/bsDados/consolidadoAdapter";
import type { ParsedFinancialData, ParsedRow, BalanceteEntry } from "@/services/bsDados/types";

export interface JanelaConsolidado {
  from: { ano: number; mes: number };
  to: { ano: number; mes: number };
}

const REALTIME_TABLES = [
  "balancete_consolidado",
  "prospeccao_file_parse_cache",
  "lancamentos",
  "bs_consolidado",
  "dre_consolidado",
  "fluxo_caixa_consolidado",
  "balancete_runs",
] as const;

const CACHE_FINANCIAL_TYPES = new Set(["balancete", "dre", "balanco"]);

interface ConsolidadoDbRow {
  conta: string;
  codigo?: string | null;
  descricao: string;
  tipo: string;
  nivel: number;
  ano: number;
  mes: number;
  valor: number;
  saldo?: number | null;
  qtd_lancamentos?: number;
}

interface CacheRow {
  ano: number | null;
  mes: number | null;
  tipo: string | null;
  file_name: string | null;
  balanco: unknown;
  dre: unknown;
}

function normalizeCacheRows(rows: CacheRow[], janela?: JanelaConsolidado | null) {
  const yearsSet = new Set<string>();
  const balanco: ParsedRow[] = [];
  const dre: ParsedRow[] = [];
  const entries: BalanceteEntry[] = [];

  const inJanela = (a: number, m: number) => {
    if (!janela) return true;
    const k = `${a}-${String(m).padStart(2, "0")}`;
    const fk = `${janela.from.ano}-${String(janela.from.mes).padStart(2, "0")}`;
    const tk = `${janela.to.ano}-${String(janela.to.mes).padStart(2, "0")}`;
    return k >= fk && k <= tk;
  };

  const remapValues = (item: ParsedRow, mesKey: string): ParsedRow => {
    const values = item?.values && typeof item.values === "object" ? item.values : {};
    const value = Object.values(values).reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
    return { ...item, values: { [mesKey]: value } };
  };

  for (const row of rows || []) {
    const ano = Number(row.ano);
    const mes = Number(row.mes);
    if (!ano || !mes || !inJanela(ano, mes)) continue;
    const tipo = String(row.tipo || "").toLowerCase();
    if (!CACHE_FINANCIAL_TYPES.has(tipo)) continue;
    const mesKey = `${ano}-${String(mes).padStart(2, "0")}`;
    yearsSet.add(mesKey);
    entries.push({ fileName: row.file_name || `cache_${mesKey}`, mesReferencia: mesKey });
    if (Array.isArray(row.balanco)) balanco.push(...(row.balanco as ParsedRow[]).map((r) => remapValues(r, mesKey)));
    if (Array.isArray(row.dre)) dre.push(...(row.dre as ParsedRow[]).map((r) => remapValues(r, mesKey)));
  }

  return {
    parsed: { years: Array.from(yearsSet).sort(), balanco, dre } as ParsedFinancialData,
    entries,
  };
}

export function useConsolidadoBS(
  companyId: string | null,
  refreshKey?: string | number | null,
  janela?: JanelaConsolidado | null,
) {
  const [parsed, setParsed] = useState<ParsedFinancialData | null>(null);
  const [entries, setEntries] = useState<BalanceteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveTick, setLiveTick] = useState(0);
  const debounceRef = useRef<number | null>(null);

  // Fetch principal — re-roda em qualquer mudança de companyId/janela/refreshKey/liveTick.
  useEffect(() => {
    if (!companyId) { setParsed(null); setEntries([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [consolidadoRes, lancRes, cacheRes] = await Promise.all([
        supabase
          .from("balancete_consolidado")
          .select("conta, codigo, descricao, tipo, nivel, ano, mes, valor, saldo, qtd_lancamentos")
          .eq("company_id", companyId)
          .order("ano", { ascending: true })
          .order("mes", { ascending: true })
          .order("conta", { ascending: true }),
        supabase
          .from("lancamentos")
          .select("ano, mes, origem_arquivo")
          .eq("company_id", companyId)
          .not("origem_arquivo", "is", null),
        supabase
          .from("prospeccao_file_parse_cache")
          .select("ano, mes, tipo, file_name, balanco, dre")
          .eq("company_id", companyId)
          .is("error_message", null)
          .order("ano", { ascending: true })
          .order("mes", { ascending: true }),
      ]);
      if (cancelled) return;
      const { data, error } = consolidadoRes;
      if (error) {
        console.error("[useConsolidadoBS]", error);
        // Mantém último parsed (não zera UI durante erros transitórios)
      } else {
        const inJanela = (a: number, m: number) => {
          if (!janela) return true;
          const k = `${a}-${String(m).padStart(2, "0")}`;
          const fk = `${janela.from.ano}-${String(janela.from.mes).padStart(2, "0")}`;
          const tk = `${janela.to.ano}-${String(janela.to.mes).padStart(2, "0")}`;
          return k >= fk && k <= tk;
        };
        const filteredRows = ((data || []) as ConsolidadoDbRow[]).filter((r) => inJanela(r.ano, r.mes));

        const filesByPeriod = new Map<string, string[]>();
        for (const l of ((lancRes.data || []) as Array<{ ano: number | null; mes: number | null; origem_arquivo: string | null }>)) {
          if (!l.origem_arquivo || !l.ano || !l.mes) continue;
          if (!inJanela(l.ano, l.mes)) continue;
          const periodKey = `${l.ano}-${String(l.mes).padStart(2, "0")}`;
          const fileName = l.origem_arquivo.split("/").pop() || l.origem_arquivo;
          const arr = filesByPeriod.get(periodKey) || [];
          if (!arr.includes(fileName)) arr.push(fileName);
          filesByPeriod.set(periodKey, arr);
        }
        // Consolidado (fonte primária) + cache (preenche meses ausentes).
        // Antes: cache só era usado quando consolidado estava vazio → meses
        // sem balancete_consolidado ficavam invisíveis na Auditoria mesmo
        // tendo dados extraídos pelo pipeline. Agora mesclamos os meses que
        // o consolidado não cobre dentro da janela.
        const primary = filteredRows.length > 0
          ? consolidadoToParsed(filteredRows, filesByPeriod)
          : { parsed: { years: [], balanco: [], dre: [] } as ParsedFinancialData, entries: [] as BalanceteEntry[] };
        const coveredMonths = new Set(primary.parsed.years);
        const cacheRows = ((cacheRes.data as CacheRow[]) || []).filter((c) => {
          if (!c.ano || !c.mes) return false;
          const k = `${c.ano}-${String(c.mes).padStart(2, "0")}`;
          return !coveredMonths.has(k);
        });
        const fallback = normalizeCacheRows(cacheRows, janela);
        const mergedYears = Array.from(new Set([...primary.parsed.years, ...fallback.parsed.years])).sort();
        const mergedParsed: ParsedFinancialData = {
          years: mergedYears,
          balanco: [...primary.parsed.balanco, ...fallback.parsed.balanco],
          dre: [...primary.parsed.dre, ...fallback.parsed.dre],
        };
        const mergedEntries = [...primary.entries, ...fallback.entries];
        const hasAny = mergedYears.length > 0 || mergedParsed.balanco.length > 0 || mergedParsed.dre.length > 0;
        setParsed(hasAny ? mergedParsed : null);
        setEntries(mergedEntries);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, refreshKey, liveTick, janela]);

  // Realtime — debounce 600ms para acumular múltiplos eventos seguidos.
  useEffect(() => {
    if (!companyId) return;
    const bump = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => setLiveTick(t => t + 1), 600);
    };
    const channel = supabase.channel(`workspace-live:${companyId}`);
    for (const table of REALTIME_TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `company_id=eq.${companyId}` },
        bump,
      );
    }
    channel.subscribe();
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  return { parsed, entries, loading };
}
