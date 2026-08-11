import { supabase } from "@/integrations/supabase/client";

export interface RmaPeriodAnalysis {
  id: string;
  company_id: string;
  year: number;
  month: number;
  period_label: string; // MM-YYYY
  status: "em_analise" | "concluido" | "erro";
  percentual: number;
  topics: any[];
  diagnostico: any;
  indicadores: any;
  kanitz: any;
  score_rj: any;
  pendencias: any;
  alertas: any;
  log: string[];
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export function buildPeriodLabel(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}-${year}`;
}

export function getCurrentPeriod(): { year: number; month: number; label: string } {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return { year, month, label: buildPeriodLabel(year, month) };
}

/** Lista o histórico de análises mensais para uma empresa (mais recentes primeiro). */
export async function listCompanyPeriods(companyId: string): Promise<RmaPeriodAnalysis[]> {
  const { data, error } = await supabase
    .from("prospecção_period_analyses" as any)
    .select("*")
    .eq("company_id", companyId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (error) throw error;
  return ((data as any[]) || []) as RmaPeriodAnalysis[];
}

/** Lista o histórico de várias empresas (para a aba Histórico do consultor). */
export async function listPeriodsForCompanies(companyIds: string[]): Promise<RmaPeriodAnalysis[]> {
  if (companyIds.length === 0) return [];
  const { data, error } = await supabase
    .from("prospecção_period_analyses" as any)
    .select("*")
    .in("company_id", companyIds)
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (error) throw error;
  return ((data as any[]) || []) as RmaPeriodAnalysis[];
}
