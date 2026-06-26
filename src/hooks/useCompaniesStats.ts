import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenantId } from "@/lib/tenant";
import { getCompaniesStats, type CompaniesStats } from "@/services/companiesService";

type Scope = "all" | "owned" | "assigned" | "released";

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
 * Stats agregadas (total + contagem por status) calculadas no backend
 * com count: 'exact', head: true (sem trafegar rows).
 *
 * queryKey inclui SEMPRE [tenantId, userId, scope] para isolamento multi-tenant.
 */
export function useCompaniesStats(scope: Scope = "all", enabled = true) {
  const tenantId = useActiveTenantId();
  const userId = useCurrentUserId();

  return useQuery<CompaniesStats>({
    queryKey: ["companies-stats", tenantId, userId, scope],
    enabled: enabled && !!userId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: () => getCompaniesStats(userId as string, scope),
  });
}
