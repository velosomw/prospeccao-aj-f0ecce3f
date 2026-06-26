// Cálculo unificado do Score Global do RMA.
// Usado tanto no Workspace (RMAStatusTab) quanto nos Alertas Inteligentes (Dashboard)
// para garantir que os percentuais batam exatamente entre as telas.
//
// Fórmula (não-regressiva):
//   weightedStatus = (completos*1 + incompletos*0.5 + pendentes*0) / total * 100
//   liveAvg        = média de completude por tópico
//   combined       = (weightedStatus + liveAvg) / 2
//   score          = max(combined, weightedStatus, liveAvg, baseline)

export interface ScoreTopic {
  id?: string;
  number?: number;
  name?: string;
  status?: "completo" | "incompleto" | "pendente" | string;
  completude?: number;
  fileCount?: number;
  docsParsed?: number;
  processing?: boolean;
  errors?: string[];
}

export interface ScoreFile {
  company_id?: string | null;
  path?: string | null;
  file_name?: string | null;
  status?: string | null;
}

const inferTopicNumber = (topic: ScoreTopic, index: number) => {
  if (Number.isFinite(Number(topic.number))) return Number(topic.number);
  const match = String(topic.id || "").match(/\d+/);
  return match ? Number(match[0]) : index + 1;
};

import { fileMatchesTopic, filterIngestibleFiles } from "@/lib/topicMatch";
import { RMA_TOPICS } from "@/data/rmaTopics";

export function buildLiveScoreTopics(
  topics: ScoreTopic[] | null | undefined,
  files: ScoreFile[] | null | undefined,
): ScoreTopic[] {
  let base = (Array.isArray(topics) ? topics : []).map((topic, index) => ({
    ...topic,
    number: inferTopicNumber(topic, index),
    status: topic.status || "pendente",
    completude: Number(topic.completude) || 0,
    fileCount: Number(topic.fileCount) || 0,
    docsParsed: Number(topic.docsParsed) || 0,
  }));

  // Fallback: quando a análise IA ainda não produziu tópicos, usa a lista
  // canônica do RMA para que o workspace consiga refletir a presença de
  // arquivos no OneDrive em vez de mostrar tudo zerado.
  if (base.length === 0) {
    base = RMA_TOPICS.map((t) => ({
      id: `t${t.number}`,
      number: t.number,
      name: t.name,
      status: "pendente" as const,
      completude: 0,
      fileCount: 0,
      docsParsed: 0,
    })) as any;
  }

  const cleanFiles = filterIngestibleFiles(files);
  if (cleanFiles.length === 0) return base;

  // Dedup por (path normalizado + nome) — evita inflar contagem por re-uploads.
  const seen = new Set<string>();
  const dedupedFiles = cleanFiles.filter((f) => {
    const key = `${(f.path || "").toLowerCase()}::${(f.file_name || "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return base.map((topic) => {
    const n = inferTopicNumber(topic, 0);
    const matched = dedupedFiles.filter((file) => fileMatchesTopic(file, n));
    if (matched.length === 0) return topic;

    const fileCount = matched.length;
    const docsParsed = matched.filter((file) => file.status === "processed").length;
    const liveCompletude = fileCount > 0 ? Math.round((docsParsed / fileCount) * 100) : 0;
    const completude = Math.max(Number(topic.completude) || 0, liveCompletude);
    const status: "completo" | "pendente" | "incompleto" =
      fileCount === 0 ? "pendente" : completude >= 100 ? "completo" : "incompleto";

    return { ...topic, fileCount, docsParsed, completude, status };
  });
}

export function groupFilesByCompany(files: ScoreFile[] | null | undefined): Record<string, ScoreFile[]> {
  return (Array.isArray(files) ? files : []).reduce<Record<string, ScoreFile[]>>((acc, file) => {
    if (!file.company_id) return acc;
    if (!acc[file.company_id]) acc[file.company_id] = [];
    acc[file.company_id].push(file);
    return acc;
  }, {});
}

export function computeRmaScore(topics: ScoreTopic[] | null | undefined, baseline = 0): number {
  const list = Array.isArray(topics) ? topics : [];
  const total = list.length || 1;
  const completos = list.filter((t) => t.status === "completo").length;
  const incompletos = list.filter((t) => t.status === "incompleto").length;
  const weightedStatus = Math.round(
    ((completos * 1 + incompletos * 0.5) / total) * 100,
  );
  const liveAvg = list.length > 0
    ? Math.round(list.reduce((s, t) => s + (Number(t.completude) || 0), 0) / list.length)
    : 0;
  const combined = Math.round((weightedStatus + liveAvg) / 2);
  const safeBaseline = Math.max(0, Math.min(100, Number(baseline) || 0));
  return Math.max(0, Math.min(100, Math.max(combined, weightedStatus, liveAvg, safeBaseline)));
}

// ---------------------------------------------------------------------------
// Endpoint único — consome o edge function `rma-score` para garantir que
// Dashboard, Workspace e Alertas Inteligentes usem exatamente o mesmo cálculo.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { invokeAuthed } from "@/lib/invokeAuthed";

export interface UnifiedRmaScore {
  percentual: number;
  weightedStatus: number;
  liveAvg: number;
  combined: number;
  baseline: number;
  totals: { total: number; completos: number; incompletos: number; pendentes: number };
  topics: ScoreTopic[];
}

export async function fetchRmaScores(
  companyIds?: string[],
): Promise<Record<string, UnifiedRmaScore>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      // Sem sessão: não chama a edge (evita 401) — Dashboard usa cálculo local.
      return {};
    }
    const { data, error } = await invokeAuthed<{ scores: Record<string, UnifiedRmaScore> }>(
      "rma-score",
      companyIds && companyIds.length > 0 ? { companyIds } : {},
    );
    if (error) throw error;
    return (data?.scores ?? {}) as Record<string, UnifiedRmaScore>;
  } catch (e) {
    console.warn("[rmaScore] fetchRmaScores falhou, usando cálculo local:", e);
    return {};
  }
}
