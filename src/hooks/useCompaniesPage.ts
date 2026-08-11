import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-any";
import { useEffect, useState } from "react";
import { useActiveTenantId } from "@/lib/tenant";
import {
  listCompaniesPage,
  listMyAssignedCompaniesPage,
  listReleasedCompaniesPage,
  type CompaniesPageOpts,
  type PageResult,
  type Company,
} from "@/services/companiesService";

type Mode = "all" | "owned" | "assigned" | "released";

interface Params extends Omit<CompaniesPageOpts, "ownedOnly"> {
  mode: Mode;
  /**
   * enabled = false desliga a query (útil enquanto o user ainda não carregou).
   */
  enabled?: boolean;
}

function useCurrentUserId(): string | null {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUid(s?.user?.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return uid;
}

/**
 * Hook React Query para paginação backend de empresas/Prospeccoes.
 *
 * O queryKey inclui SEMPRE [tenantId, userId, mode, page, pageSize, search, status]
 * para garantir isolamento entre clientes/usuários (multi-tenant) e evitar
 * que dados de um perfil/empresa apareçam para outro ao trocar de contexto.
 *
 * Carrega APENAS os registros da página atual (range + count: 'exact'),
 * mantendo navegação rápida mesmo com milhares de registros.
 */
export function useCompaniesPage(params: Params) {
  const tenantId = useActiveTenantId();
  const userId = useCurrentUserId();
  const {
    mode,
    page = 1,
    pageSize = 20,
    search = "",
    status = null,
    enabled = true,
  } = params;

  const queryKey = [
    "companies-page",
    tenantId,
    userId,
    mode,
    page,
    pageSize,
    search,
    status,
  ] as const;

  return useQuery<PageResult<Company>>({
    queryKey,
    enabled: enabled && !!userId,
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000, // 2 min — listas são reativas mas pouco voláteis
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      if (!userId) {
        return { rows: [], total: 0, page, pageSize };
      }
      if (mode === "assigned") {
        return listMyAssignedCompaniesPage(userId, { page, pageSize, search, status });
      }
      if (mode === "released") {
        return listReleasedCompaniesPage(userId, { page, pageSize, search, status });
      }
      return listCompaniesPage(userId, {
        page,
        pageSize,
        search,
        status,
        ownedOnly: mode === "owned",
      });
    },
  });
}
