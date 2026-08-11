// Hook: lista, cria e restaura snapshots do Balancete/BS/DRE de um mês.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-any";

export interface BalanceteSnapshot {
  id: string;
  company_id: string;
  ano: number;
  mes: number;
  versao: number;
  motivo: string | null;
  origem: string | null;
  rows_balancete: number;
  rows_bs: number;
  rows_dre: number;
  created_by: string | null;
  created_at: string;
  restored_from: string | null;
}

export function useBalanceteSnapshots(
  companyId: string | null,
  ano: number | null,
  mes: number | null,
) {
  const [snapshots, setSnapshots] = useState<BalanceteSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) { setSnapshots([]); return; }
    setLoading(true);
    try {
      let q = supabase
        .from("balancete_snapshots")
        .select("id, company_id, ano, mes, versao, motivo, origem, rows_balancete, rows_bs, rows_dre, created_by, created_at, restored_from")
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

  const create = useCallback(async (motivo?: string) => {
    if (!companyId || !ano || !mes) return null;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("balancete-snapshot", {
        body: { action: "create", company_id: companyId, ano, mes, motivo },
      });
      if (error) throw error;
      await load();
      return data;
    } finally { setBusy(false); }
  }, [companyId, ano, mes, load]);

  const restore = useCallback(async (snapshotId: string, motivo?: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("balancete-snapshot", {
        body: { action: "restore", snapshot_id: snapshotId, motivo },
      });
      if (error) throw error;
      await load();
      return data;
    } finally { setBusy(false); }
  }, [load]);

  return { snapshots, loading, busy, create, restore, reload: load };
}
