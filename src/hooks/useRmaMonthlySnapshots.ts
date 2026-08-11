// Hook para snapshots mensais consolidados do Prospeccao.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RmaMonthlySnapshot {
  id: string;
  company_id: string;
  prospecção_id: string | null;
  ano: number;
  mes: number;
  versao: number;
  motivo: string | null;
  origem: string;
  rows_balancete: number;
  rows_bs: number;
  rows_dre: number;
  alerts_count: number;
  percentual: number;
  resumo: any;
  created_by: string | null;
  created_at: string;
}

export function useRmaMonthlySnapshots(
  companyId: string | null,
  ano?: number | null,
  mes?: number | null,
) {
  const [snapshots, setSnapshots] = useState<RmaMonthlySnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setSnapshots([]); return; }
    setLoading(true);
    try {
      let q = supabase
        .from("prospecção_monthly_snapshots")
        .select("*")
        .eq("company_id", companyId)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .order("versao", { ascending: false });
      if (ano) q = q.eq("ano", ano);
      if (mes) q = q.eq("mes", mes);
      const { data } = await q;
      setSnapshots((data as any) || []);
    } finally { setLoading(false); }
  }, [companyId, ano, mes]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (payload: { ano: number; mes: number; motivo?: string }) => {
    if (!companyId) return null;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("prospecção-monthly-snapshot", {
        body: { action: "create", company_id: companyId, ...payload },
      });
      if (error) throw error;
      await load();
      return data;
    } finally { setBusy(false); }
  }, [companyId, load]);

  return { snapshots, loading, busy, create, reload: load };
}
