import { supabase } from "@/integrations/supabase/client";

export type ReleaseStatus = "active" | "suspended" | "revoked";
export type ReleaseRole = "magistrado" | "recuperanda";

export interface ProspeccaoRelease {
  id: string;
  company_id: string;
  year: number;
  month: number;
  released_to_user_id: string;
  released_to_role: ReleaseRole;
  status: ReleaseStatus;
  notes: string | null;
  released_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReleaseInput {
  company_id: string;
  year: number;
  month: number;
  released_to_user_id: string;
  released_to_role: ReleaseRole;
  notes?: string;
}

const TABLE = "prospecção_release_assignments" as any;

export async function listReleases(opts?: { companyId?: string; userId?: string }): Promise<ProspeccaoRelease[]> {
  let q = (supabase.from(TABLE) as any).select("*").order("created_at", { ascending: false });
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  if (opts?.userId) q = q.eq("released_to_user_id", opts.userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ProspeccaoRelease[];
}

export async function listMyReleases(): Promise<ProspeccaoRelease[]> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) return [];
  return listReleases({ userId: uid });
}

export async function createRelease(input: CreateReleaseInput): Promise<ProspeccaoRelease> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  const payload = { ...input, status: "active", released_by: uid, notes: input.notes || null };
  const { data, error } = await (supabase.from(TABLE) as any).insert(payload).select().single();
  if (error) throw error;

  await supabase.from("prospecção_assignment_history").insert({
    company_id: input.company_id,
    action: "release",
    from_consultant_user_id: null,
    to_consultant_user_id: input.released_to_user_id,
    changed_by: uid,
  });
  return data as ProspeccaoRelease;
}

export async function updateReleaseStatus(id: string, status: ReleaseStatus, companyId: string, userId: string): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  const { error } = await (supabase.from(TABLE) as any).update({ status }).eq("id", id);
  if (error) throw error;

  const action = status === "suspended" ? "suspend" : status === "revoked" ? "revoke" : "release";
  await supabase.from("prospecção_assignment_history").insert({
    company_id: companyId,
    action,
    from_consultant_user_id: null,
    to_consultant_user_id: userId,
    changed_by: uid,
  });
}

export async function deleteRelease(id: string, companyId: string, userId: string): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  const { error } = await (supabase.from(TABLE) as any).delete().eq("id", id);
  if (error) throw error;

  await supabase.from("prospecção_assignment_history").insert({
    company_id: companyId,
    action: "unrelease",
    from_consultant_user_id: userId,
    to_consultant_user_id: null,
    changed_by: uid,
  });
}

export const monthLabel = (m: number) =>
  ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][m - 1] || String(m);

export const statusLabel: Record<ReleaseStatus, { label: string; color: string }> = {
  active: { label: "Ativa", color: "hsl(142,76%,36%)" },
  suspended: { label: "Suspensa", color: "hsl(38,92%,50%)" },
  revoked: { label: "Revogada", color: "hsl(0,70%,55%)" },
};
