import { useQuery } from "@tanstack/react-query";
import { invokeAuthed } from "@/lib/invokeAuthed";
import { useActiveTenantId } from "@/lib/tenant";

export interface TeamMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  active: boolean | null;
  created_at: string | null;
  user_roles?: { role: string }[];
  prospeccoes_count?: number;
  score_medio?: number;
  sla_medio?: number;
}

export function useTeamStats(roleFilter: string = "consultor") {
  const tenantId = useActiveTenantId();

  return useQuery({
    queryKey: ["team-stats", tenantId, roleFilter],
    queryFn: async () => {
      const { data, error } = await invokeAuthed<{ profiles: any[] }>("admin-create-user", { 
        action: "list" 
      });
      
      if (error) throw error;
      
      const all = data?.profiles ?? [];
      const members = all.filter((p) => 
        (p.user_roles ?? []).some((r: any) => r.role === roleFilter)
      );

      // Mocking some stats for now as the edge function doesn't return them yet
      // In a real scenario, we'd join with company_consultants or have the edge function aggregate this
      return members.map(m => ({
        ...m,
        prospeccoes_count: Math.floor(Math.random() * 10), // Placeholder
        score_medio: 70 + Math.floor(Math.random() * 25), // Placeholder
        sla_medio: 80 + Math.floor(Math.random() * 20),   // Placeholder
      })) as TeamMember[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
