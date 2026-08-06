// MD-GEMINI-LIVE-PROCESSING-CERTIFICATION-001 — serviço do modo LIVE CERTIFICATION
import { supabase } from "@/integrations/supabase/client";

export const FASES_CERTIFICACAO = [1, 5, 20, 100] as const;
export type FaseCertificacao = (typeof FASES_CERTIFICACAO)[number];

export interface CertProcesso {
  ordem: number;
  link: string;
  document_id: string | null;
  numero_processo: string | null;
  empresa: string | null;
  status: string;
  aprovado: boolean;
  motivo_reprovacao: string | null;
  download: Record<string, any>;
  gemini: Record<string, any>;
  business_facts: any[];
  json_canonico: any;
  painel: Record<string, any>;
  checklist: Record<string, boolean>;
  evidencias: any[];
  etapas: any[];
  tempo_total_ms: number;
}

export interface CertConsolidado {
  total_processos: number;
  processados: number;
  falhas: number;
  tempo_medio_ms: number;
  downloads: number;
  ocr: number;
  business_facts: number;
  json_validos: number;
  paineis: number;
  alertas: number;
}

export interface CertRunResult {
  ok: boolean;
  modo: string;
  fase: number;
  status: "aprovado" | "reprovado";
  run: any;
  consolidado: CertConsolidado;
  processos: CertProcesso[];
  proxima_fase: number | null;
}

export async function runLiveCertification(fase: FaseCertificacao, links?: string[]): Promise<CertRunResult> {
  const { data, error } = await supabase.functions.invoke("prospeccao-live-certification", {
    body: { fase, ...(links?.length ? { links } : {}) },
  });
  if (error) {
    const detail = (data as any)?.error;
    throw new Error(detail || error.message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as CertRunResult;
}

export async function listCertificationRuns(limit = 20) {
  const { data, error } = await supabase
    .from("certificacao_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
