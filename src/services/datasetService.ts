// Dataset + Learning Loop — service frontend
// Submete correções humanas (ground truth), lista pendentes para revisão e
// consulta o quality score consolidado do sistema.
import { supabase } from "@/integrations/supabase/client";

export interface PendingExtraction {
  id: string;
  classe: string | null;
  agent: string | null;
  path: string | null;
  raw_text: string;
  normalized_text: string | null;
  extracted_data: Record<string, unknown> | null;
  validation: { valido: boolean; correcoes: unknown[]; confianca: number } | null;
  final_confidence: number | null;
  valid: boolean | null;
  created_at: string;
}

export interface QualityScore {
  total: number;
  validados_humanos: number;
  precisao: number;
  erros: number;
  confianca_media: number;
  melhoria_pct: number;
  por_classe: Record<string, number>;
}

export interface SubmitCorrectionInput {
  extraction_id?: string;
  document_id?: string;
  prospeccao_id?: string;
  classe: string;
  agent?: string;
  path?: string;
  input_text: string;
  normalized_text?: string;
  output_original?: Record<string, unknown>;
  output_correto: Record<string, unknown>;
  corrections?: Array<{
    campo: string;
    valor_anterior?: unknown;
    valor_corrigido?: unknown;
    motivo?: string;
  }>;
  notes?: string;
}

export interface SubmitCorrectionResult {
  id: string;
  example_id: string | null;
  embedded: boolean;
  message: string;
}

const FN = "ai-validate";

export async function listPendingForReview(limit = 20): Promise<PendingExtraction[]> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FN}?pending=1&limit=${limit}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!resp.ok) throw new Error(`Falha ao listar pendentes: ${resp.status}`);
  const j = await resp.json();
  return j.pending ?? [];
}

export async function getQualityScore(): Promise<QualityScore> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FN}?quality=1`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!resp.ok) throw new Error(`Falha ao consultar quality score: ${resp.status}`);
  return (await resp.json()) as QualityScore;
}

/** Envia correção humana (ground truth) — entra automaticamente no learning loop. */
export async function submitCorrection(
  input: SubmitCorrectionInput,
): Promise<SubmitCorrectionResult> {
  const { data, error } = await supabase.functions.invoke(FN, { body: input });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as SubmitCorrectionResult;
}

export async function listValidatedByClass(classe: string, limit = 50) {
  const { data, error } = await supabase
    .from("dataset_validated")
    .select("*")
    .eq("classe", classe)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function listActiveExamples(classe: string, limit = 50) {
  const { data, error } = await supabase
    .from("prompt_examples")
    .select("id, classe, agent, input_text, output_json, weight, created_at")
    .eq("classe", classe)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
