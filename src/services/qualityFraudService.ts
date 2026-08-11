// Service para Quality Engine + Antifraude
import { supabase } from "@/integrations/supabase/client";

export interface FraudAlert {
  id: string;
  extraction_id: string | null;
  document_id: string | null;
  prospeccao_id: string | null;
  classe: string | null;
  alert_type: "duplicate" | "outlier" | "inconsistency";
  severity: "low" | "medium" | "high";
  message: string;
  details: Record<string, unknown>;
  status: "open" | "acknowledged" | "resolved" | "false_positive";
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface QualityMetrics {
  total: number;
  avg_quality: number;
  avg_ocr: number;
  avg_ai: number;
  avg_validation: number;
  pending_review: number;
  reprocessed: number;
  ok: number;
  by_classe: Array<{ classe: string; count: number; avg_quality: number }>;
}

export interface FullProcessResult {
  extraction_id: string;
  quality_score: number;
  validation_score: number;
  ocr_score: number;
  ai_score: number;
  quality_action: "ok" | "reprocessed" | "pending_review";
  alerts_count: number;
  retried: boolean;
}

/** Dispara o pipeline unificado para um documento. */
export async function fullProcess(documentId: string): Promise<FullProcessResult> {
  const { data, error } = await supabase.functions.invoke("ai-full-process", {
    body: { document_id: documentId },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as FullProcessResult;
}

export async function listFraudAlerts(opts?: {
  status?: FraudAlert["status"];
  limit?: number;
}): Promise<FraudAlert[]> {
  let q = supabase
    .from("fraud_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as FraudAlert[];
}

export async function updateAlertStatus(
  id: string,
  status: FraudAlert["status"],
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === "resolved" || status === "false_positive") {
    patch.resolved_at = new Date().toISOString();
  }
  const { error } = await supabase.from("fraud_alerts").update(patch).eq("id", id);
  if (error) throw error;
}

export async function getQualityMetrics(): Promise<QualityMetrics> {
  const { data, error } = await supabase
    .from("ai_extractions")
    .select("classe,quality_score,quality_action,ocr_confidence,ai_confidence,validation_score")
    .eq("status", "completed")
    .not("quality_score", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data || []) as Array<{
    classe: string | null;
    quality_score: number | null;
    quality_action: string | null;
    ocr_confidence: number | null;
    ai_confidence: number | null;
    validation_score: number | null;
  }>;

  const total = rows.length;
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const qs = rows.map((r) => Number(r.quality_score ?? 0));
  const os = rows.map((r) => Number(r.ocr_confidence ?? 0));
  const ais = rows.map((r) => Number(r.ai_confidence ?? 0));
  const vs = rows.map((r) => Number(r.validation_score ?? 0));

  const groups: Record<string, number[]> = {};
  for (const r of rows) {
    const c = r.classe || "OUTRO";
    if (!groups[c]) groups[c] = [];
    groups[c].push(Number(r.quality_score ?? 0));
  }

  return {
    total,
    avg_quality: avg(qs),
    avg_ocr: avg(os),
    avg_ai: avg(ais),
    avg_validation: avg(vs),
    pending_review: rows.filter((r) => r.quality_action === "pending_review").length,
    reprocessed: rows.filter((r) => r.quality_action === "reprocessed").length,
    ok: rows.filter((r) => r.quality_action === "ok" || !r.quality_action).length,
    by_classe: Object.entries(groups).map(([classe, vals]) => ({
      classe,
      count: vals.length,
      avg_quality: avg(vals),
    })),
  };
}
