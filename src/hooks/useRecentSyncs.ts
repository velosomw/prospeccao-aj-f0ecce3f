import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-any";
import { useActiveTenantId } from "@/lib/tenant";

export interface SyncBatch {
  id: string;
  dataset_type: string;
  status: string;
  rows_processed: number;
  rows_created: number;
  rows_updated: number;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

export function useRecentSyncs(limit = 5) {
  const tenantId = useActiveTenantId();

  return useQuery({
    queryKey: ["recent-syncs", tenantId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spreadsheet_import_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as SyncBatch[];
    },
    staleTime: 60 * 1000,
  });
}
