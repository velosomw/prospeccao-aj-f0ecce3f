import { supabase } from "@/lib/supabase-any";

export interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  sector: string | null;
  cnae: string | null;
  city: string | null;
  uf: string | null;
  zip: string | null;
  prospeccao_id: string | null;
  address: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  phone_fixed: string | null;
  notes: string | null;
  status: string;
  source: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  auto_monthly?: boolean;
  execution_year?: number | null;
  period_active?: boolean;
  current_period_month?: number | null;
  last_analyzed_period?: string | null;
}

export interface CreateCompanyInput {
  name: string;
  cnpj?: string;
  sector?: string;
  cnae?: string;
  city?: string;
  uf?: string;
  zip?: string;
  prospeccao_id?: string;
  address?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  phone_fixed?: string;
  notes?: string;
  auto_monthly?: boolean;
  execution_year?: number;
  period_active?: boolean;
  current_period_month?: number;
}

export interface CompanyTopic {
  id: string;
  company_id: string;
  topic_number: number;
  topic_name: string;
}

export async function listCompanies(opts?: { ownedOnly?: boolean }): Promise<Company[]> {
  let q = supabase.from("companies").select("*").order("name");
  if (opts?.ownedOnly) {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user?.id;
    if (!uid) return [];
    q = q.eq("created_by", uid);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Company[];
}

export async function createCompany(
  input: CreateCompanyInput,
  topics: { number: number; name: string }[]
): Promise<Company> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) throw new Error("Sessão expirada. Faça login novamente.");

  const now = new Date();
  const payload: any = {
    name: input.name,
    cnpj: input.cnpj || null,
    sector: input.sector || null,
    cnae: input.cnae || null,
    city: input.city || null,
    uf: input.uf || null,
    zip: input.zip || null,
    prospeccao_id: input.prospeccao_id || null,
    address: input.address || null,
    contact_name: input.contact_name || null,
    email: input.email || null,
    phone: input.phone || null,
    phone_fixed: input.phone_fixed || null,
    notes: input.notes || null,
    status: "pendente_ativacao",
    source: "auditor",
    created_by: uid,
    auto_monthly: input.auto_monthly ?? false,
    execution_year: input.execution_year ?? now.getFullYear(),
    period_active: input.period_active ?? false,
    current_period_month: input.current_period_month
      ?? (input.period_active ? now.getMonth() + 1 : null),
  };

  const { data, error } = await supabase
    .from("companies")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  if (topics.length > 0) {
    const rows = topics.map((t) => ({
      company_id: data.id,
      topic_number: t.number,
      topic_name: t.name,
    }));
    const { error: tErr } = await supabase.from("company_prospeccao_topics").insert(rows);
    if (tErr) throw tErr;
  }

  return data as Company;
}

export async function getCompanyTopics(companyId: string): Promise<CompanyTopic[]> {
  const { data, error } = await supabase
    .from("company_prospeccao_topics")
    .select("*")
    .eq("company_id", companyId)
    .order("topic_number");
  if (error) throw error;
  return (data || []) as CompanyTopic[];
}

export interface CompanyConsultant {
  id: string;
  company_id: string;
  consultant_user_id: string;
  assigned_at: string;
}

export async function listCompanyConsultants(): Promise<CompanyConsultant[]> {
  const { data, error } = await supabase.from("company_consultants").select("*");
  if (error) throw error;
  return (data || []) as CompanyConsultant[];
}

export async function listConsultantsForCompany(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("company_consultants")
    .select("consultant_user_id")
    .eq("company_id", companyId);
  if (error) throw error;
  return (data || []).map((r: any) => r.consultant_user_id);
}

export async function listCompaniesForConsultant(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("company_consultants")
    .select("company_id")
    .eq("consultant_user_id", userId);
  if (error) throw error;
  return (data || []).map((r: any) => r.company_id);
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CompaniesPageOpts {
  page?: number;          // 1-based
  pageSize?: number;      // default 20
  search?: string;        // filtra por name/cnpj/prospeccao_id
  ownedOnly?: boolean;    // limita a created_by = userId
  status?: string | null; // filtro opcional por status
}

/**
 * Pagina empresas no backend usando range() + count: 'exact'.
 * Inclua sempre userId + tenantId no queryKey React Query.
 */
export async function listCompaniesPage(
  userId: string,
  opts: CompaniesPageOpts = {}
): Promise<PageResult<Company>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("companies")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.ownedOnly && userId) q = q.eq("created_by", userId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim().replace(/[,()]/g, " ");
    q = q.or(`name.ilike.%${s}%,cnpj.ilike.%${s}%,prospeccao_id.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    rows: (data || []) as Company[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

export interface CompaniesStats {
  total: number;
  byStatus: Record<string, number>;
}

const KNOWN_STATUSES = [
  "pendente_ativacao",
  "ativa",
  "em_analise",
  "em_revisao",
  "concluido",
  "pausada",
  "inativa",
] as const;

/**
 * Stats agregadas no backend (count: 'exact', head: true) — não trafega rows.
 * Roda uma query por status em paralelo + 1 query de total.
 *
 * scope: 'all' (todas), 'owned' (created_by = userId), 'assigned' (consultor),
 *        'released' (prospeccao_release_assignments.released_to_user_id = userId).
 */
export async function getCompaniesStats(
  userId: string,
  scope: "all" | "owned" | "assigned" | "released" = "all"
): Promise<CompaniesStats> {
  // Resolve IDs filter quando o escopo depende de tabela auxiliar
  let idFilter: string[] | null = null;
  if (scope === "assigned") {
    if (!userId) return { total: 0, byStatus: {} };
    idFilter = await listCompaniesForConsultant(userId);
    if (idFilter.length === 0) return { total: 0, byStatus: {} };
  } else if (scope === "released") {
    if (!userId) return { total: 0, byStatus: {} };
    const { data: rels } = await supabase
      .from("prospeccao_release_assignments")
      .select("company_id")
      .eq("released_to_user_id", userId)
      .eq("status", "active");
    idFilter = (rels || []).map((r: any) => r.company_id as string);
    if (idFilter.length === 0) return { total: 0, byStatus: {} };
  }

  const baseQuery = () => {
    let q = supabase.from("companies").select("*", { count: "exact", head: true });
    if (scope === "owned" && userId) q = q.eq("created_by", userId);
    if (idFilter) q = q.in("id", idFilter);
    return q;
  };

  // Total
  const totalP = baseQuery();

  // Por status (em paralelo)
  const statusQs = KNOWN_STATUSES.map((s) =>
    baseQuery().eq("status", s).then((r) => ({ s, count: r.count ?? 0, error: r.error }))
  );

  const [{ count: total }, ...perStatus] = await Promise.all([totalP, ...statusQs]);

  const byStatus: Record<string, number> = {};
  for (const r of perStatus) byStatus[r.s] = r.count;

  return { total: total ?? 0, byStatus };
}

/**
 * Pagina empresas atribuídas ao consultor logado, no backend.
 * Faz 2 passos: busca os IDs do consultor e então lista companies com range/count.
 */
export async function listMyAssignedCompaniesPage(
  userId: string,
  opts: Omit<CompaniesPageOpts, "ownedOnly"> = {}
): Promise<PageResult<Company>> {
  if (!userId) return { rows: [], total: 0, page: 1, pageSize: opts.pageSize ?? 20 };

  const ids = await listCompaniesForConsultant(userId);
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  if (ids.length === 0) return { rows: [], total: 0, page, pageSize };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("companies")
    .select("*", { count: "exact" })
    .in("id", ids)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim().replace(/[,()]/g, " ");
    q = q.or(`name.ilike.%${s}%,cnpj.ilike.%${s}%,prospeccao_id.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    rows: (data || []) as Company[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Pagina empresas liberadas ao usuário (Magistrado/Recuperanda)
 * via prospeccao_release_assignments, no backend.
 */
export async function listReleasedCompaniesPage(
  userId: string,
  opts: Omit<CompaniesPageOpts, "ownedOnly"> = {}
): Promise<PageResult<Company>> {
  if (!userId) return { rows: [], total: 0, page: 1, pageSize: opts.pageSize ?? 20 };

  const { data: rels } = await supabase
    .from("prospeccao_release_assignments")
    .select("company_id")
    .eq("released_to_user_id", userId)
    .eq("status", "active");

  const ids = (rels || []).map((r: any) => r.company_id as string);
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  if (ids.length === 0) return { rows: [], total: 0, page, pageSize };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("companies")
    .select("*", { count: "exact" })
    .in("id", ids)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim().replace(/[,()]/g, " ");
    q = q.or(`name.ilike.%${s}%,cnpj.ilike.%${s}%,prospeccao_id.ilike.%${s}%`);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    rows: (data || []) as Company[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Lista as empresas (Prospeccoes) atribuídas ao consultor logado */
export async function listMyAssignedCompanies(): Promise<Company[]> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) return [];
  const ids = await listCompaniesForConsultant(uid);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Company[];
}

/** Atualiza o status de uma empresa (ex.: 'pendente_ativacao' → 'ativa') */
export async function updateCompanyStatus(companyId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("companies")
    .update({ status })
    .eq("id", companyId);
  if (error) throw error;
}

/** Atualiza dados de cadastro da empresa/Prospeccao. */
export async function updateCompany(
  companyId: string,
  patch: Partial<CreateCompanyInput>
): Promise<Company> {
  const { data, error } = await supabase
    .from("companies")
    .update(patch as any)
    .eq("id", companyId)
    .select()
    .single();
  if (error) throw error;
  return data as Company;
}

/** Exclui uma empresa/Prospeccao. */
export async function deleteCompany(companyId: string): Promise<void> {
  const { error } = await supabase.from("companies").delete().eq("id", companyId);
  if (error) throw error;
}

/** Ativa um Prospeccao atribuído ao consultor, com validação no backend. */
export async function activateAssignedRma(companyId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("activate-prospeccao", {
    body: { companyId },
  });

  if (error) throw error;
}

/**
 * Atribui uma empresa a um consultor. Se `moveFromOthers` for true, remove
 * a associação dessa empresa com qualquer outro consultor (movimentação).
 * Registra automaticamente em `prospeccao_assignment_history`.
 */
export async function assignCompanyToConsultant(
  companyId: string,
  consultantUserId: string,
  opts?: { moveFromOthers?: boolean }
): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;

  // Identificar consultor anterior (se houver) para registrar como "move"
  let previousConsultantId: string | null = null;
  if (opts?.moveFromOthers) {
    const { data: prev } = await supabase
      .from("company_consultants")
      .select("consultant_user_id")
      .eq("company_id", companyId)
      .neq("consultant_user_id", consultantUserId)
      .maybeSingle();
    previousConsultantId = (prev as any)?.consultant_user_id || null;

    await supabase
      .from("company_consultants")
      .delete()
      .eq("company_id", companyId)
      .neq("consultant_user_id", consultantUserId);
  }

  // Verifica se já existe a associação para evitar log duplicado em re-upsert
  const { data: existing } = await supabase
    .from("company_consultants")
    .select("id")
    .eq("company_id", companyId)
    .eq("consultant_user_id", consultantUserId)
    .maybeSingle();

  const { error } = await supabase
    .from("company_consultants")
    .upsert(
      { company_id: companyId, consultant_user_id: consultantUserId, assigned_by: uid },
      { onConflict: "company_id,consultant_user_id" }
    );
  if (error) throw error;

  if (!existing) {
    await supabase.from("prospeccao_assignment_history").insert({
      company_id: companyId,
      action: previousConsultantId ? "move" : "assign",
      from_consultant_user_id: previousConsultantId,
      to_consultant_user_id: consultantUserId,
      changed_by: uid,
    });
  }
}

export async function unassignCompanyFromConsultant(
  companyId: string,
  consultantUserId: string
): Promise<void> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  const { error } = await supabase
    .from("company_consultants")
    .delete()
    .eq("company_id", companyId)
    .eq("consultant_user_id", consultantUserId);
  if (error) throw error;

  await supabase.from("prospeccao_assignment_history").insert({
    company_id: companyId,
    action: "unassign",
    from_consultant_user_id: consultantUserId,
    to_consultant_user_id: null,
    changed_by: uid,
  });
}

export interface RmaHistoryEntry {
  id: string;
  company_id: string;
  action: "assign" | "move" | "unassign";
  from_consultant_user_id: string | null;
  to_consultant_user_id: string | null;
  changed_by: string | null;
  created_at: string;
}

export async function listRmaHistory(opts?: { companyId?: string; limit?: number }): Promise<RmaHistoryEntry[]> {
  let q = supabase
    .from("prospeccao_assignment_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.companyId) q = q.eq("company_id", opts.companyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as RmaHistoryEntry[];
}


