// KPIs reais do Gestor IA — calculados a partir do banco
// Disponibilidade Agente IA = (total - falhas) / total  (ai_extractions)
// Acurácia IA = média ponderada de ai_confidence em runs válidos (status=completed, valid=true OU final_confidence>=0.7)
// Acurácia IA (extração) = bucketing por faixa de quality_score / final_confidence
import { supabase } from "@/integrations/supabase/client";

export interface GestorKpis {
  documentos_auditados: number;
  auditorias_realizadas: number;
  disponibilidade_pct: number | null; // null = sem dados
  acuracia_pct: number | null;
  total_runs: number;
  failed_runs: number;
  accuracy_distribution: Array<{ name: string; value: number; color: string }>;
  has_data: boolean;
}

const BUCKETS = [
  { name: "Excelente ≥90%", min: 0.9, color: "hsl(152,70%,45%)" },
  { name: "Bom 75–90%", min: 0.75, color: "hsl(200,80%,55%)" },
  { name: "Regular 50–75%", min: 0.5, color: "hsl(38,90%,55%)" },
  { name: "Baixo <50%", min: 0, color: "hsl(0,80%,55%)" },
];

export async function getGestorKpis(): Promise<GestorKpis> {
  // documentos
  const { count: docsCount } = await supabase
    .from("pipeline_documents")
    .select("*", { count: "exact", head: true });

  // extractions (todas)
  const { data: rows, error } = await supabase
    .from("ai_extractions")
    .select("status,error_message,ai_confidence,final_confidence,quality_score,valid")
    .limit(2000);
  if (error) throw error;

  const all = rows || [];
  const total = all.length;
  const failed = all.filter(
    (r) => r.status === "failed" || r.status === "error" || !!r.error_message,
  ).length;

  const valid = all.filter(
    (r) =>
      r.status === "completed" &&
      (r.valid === true || Number(r.final_confidence ?? 0) >= 0.7),
  );
  const accVals = valid
    .map((r) => Number(r.ai_confidence ?? r.final_confidence ?? 0))
    .filter((v) => v > 0);
  const acuracia =
    accVals.length > 0
      ? accVals.reduce((a, b) => a + b, 0) / accVals.length
      : null;

  const disponibilidade = total > 0 ? (total - failed) / total : null;

  // bucketing por quality_score (fallback final_confidence)
  const buckets = BUCKETS.map((b) => ({ ...b, value: 0 }));
  for (const r of all) {
    const score = Number(r.quality_score ?? r.final_confidence ?? 0);
    if (!score) continue;
    const idx = buckets.findIndex((b) => score >= b.min);
    if (idx >= 0) buckets[idx].value++;
  }
  const sumBuckets = buckets.reduce((a, b) => a + b.value, 0);
  const distribution = buckets.map((b) => ({
    name: b.name,
    color: b.color,
    value: sumBuckets > 0 ? Math.round((b.value / sumBuckets) * 100) : 0,
  }));

  // auditorias = prospecção_analysis_results concluídas
  const { count: auditCount } = await supabase
    .from("prospecção_analysis_results")
    .select("*", { count: "exact", head: true });

  return {
    documentos_auditados: docsCount ?? 0,
    auditorias_realizadas: auditCount ?? 0,
    disponibilidade_pct: disponibilidade,
    acuracia_pct: acuracia,
    total_runs: total,
    failed_runs: failed,
    accuracy_distribution: distribution,
    has_data: total > 0,
  };
}

export function fmtPct(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
