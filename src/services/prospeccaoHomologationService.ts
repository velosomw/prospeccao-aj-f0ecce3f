// Service for Gemini Extraction Homologation Mode
import { supabase } from "@/integrations/supabase/client";

export interface HomologationResult {
  processo: string;
  empresa: string;
  link: string;
  status: string;
  resumo_executivo: string;
  oportunidade_bex: string;
  score_comercial: number;
  evidencias: any[];
  comparativo: any[];
  json_resumido: any;
  checklist: Record<string, boolean>;
  analise_ia: any;
}

export interface HomologationReport {
  timestamp: string;
  total_processos: number;
  total_pdfs: number;
  ocr_executados: number;
  tempo_total_ms: number;
  processos: HomologationResult[];
  error?: string;
}

export async function runHomologation(limit = 3, links?: string[]): Promise<HomologationReport> {
  const { data, error } = await supabase.functions.invoke("prospeccao-process-jobs", {
    body: { limit, mode: "homologacao", ...(links?.length ? { links } : {}) },
  });

  if (error) throw error;
  const report = data as HomologationReport;
  if (report?.error) throw new Error(report.error);
  return report;
}
