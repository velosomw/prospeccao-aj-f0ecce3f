import { supabase } from "@/integrations/supabase/client";

export interface RmaAnalysisTopic {
  number: number;
  name: string;
  status: "completo" | "pendente" | "incompleto";
  completude: number;
  fileCount: number;
  docsParsed: number;
  errors: string[];
  processing?: boolean;
}

export interface RmaAnalysisResult {
  id: string;
  company_id: string;
  status: "em_analise" | "concluido" | "erro";
  percentual: number;
  topics: RmaAnalysisTopic[];
  diagnostico: any;
  indicadores: any;
  kanitz: any;
  score_rj: any;
  pendencias: any;
  alertas: any;
  balanco: any;
  dre: any;
  log: string[];
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  updated_at: string;
}

/** Dispara a análise IA (não aguarda — corre em background no servidor). */
export async function startRmaAnalysis(companyId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("prospecção-analyze", {
    body: { companyId },
  });
  if (error) throw error;
}

/** Lista os resultados mais recentes para várias empresas atribuídas. */
export async function listRmaAnalyses(companyIds: string[]): Promise<RmaAnalysisResult[]> {
  if (companyIds.length === 0) return [];

  const { data, error } = await supabase
    .from("prospecção_analysis_results")
    .select("*")
    .in("company_id", companyIds)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data as any[]) || []) as RmaAnalysisResult[];
}

/** Busca o resultado mais recente para a empresa. */
export async function getRmaAnalysis(companyId: string): Promise<RmaAnalysisResult | null> {
  const { data, error } = await supabase
    .from("prospecção_analysis_results")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return (data as any) || null;
}
