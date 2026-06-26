// Endpoint único de cálculo de Score Global RMA.
// Garante que Dashboard, Workspace e Alertas Inteligentes usem exatamente o mesmo cálculo.
//
// POST body:
//   { companyIds?: string[] }   // opcional - se omitido, calcula para todas as visíveis ao usuário
//
// Resposta:
//   { scores: { [companyId]: { percentual, weightedStatus, liveAvg, baseline, totals, topics } } }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { fileMatchesTopic, filterIngestibleFiles, dedupFiles } from "../_shared/topic-match.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScoreTopic {
  id?: string;
  number?: number;
  name?: string;
  status?: string;
  completude?: number;
  fileCount?: number;
  docsParsed?: number;
}

interface ScoreFile {
  company_id?: string | null;
  path?: string | null;
  file_name?: string | null;
  status?: string | null;
}

const inferTopicNumber = (topic: ScoreTopic, index: number): number => {
  const n = Number(topic.number);
  if (Number.isFinite(n)) return n;
  const match = String(topic.id || "").match(/\d+/);
  return match ? Number(match[0]) : index + 1;
};

// Lista canônica dos 60 tópicos do RMA (numeração 1..60).
// Usada como fallback quando a análise IA ainda não persistiu tópicos,
// evitando que o score saia zerado mesmo havendo arquivos no OneDrive.
const CANONICAL_TOPIC_NUMBERS: number[] = Array.from({ length: 60 }, (_, i) => i + 1);

function buildLiveScoreTopics(
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

  if (base.length === 0) {
    base = CANONICAL_TOPIC_NUMBERS.map((n) => ({
      id: `t${n}`,
      number: n,
      status: "pendente",
      completude: 0,
      fileCount: 0,
      docsParsed: 0,
    }));
  }

  const cleanFiles = dedupFiles(filterIngestibleFiles(files));
  if (cleanFiles.length === 0) return base;

  return base.map((topic) => {
    const n = inferTopicNumber(topic, 0);
    const matched = cleanFiles.filter((f) => fileMatchesTopic(f, n));
    if (matched.length === 0) return topic;

    const fileCount = matched.length;
    const docsParsed = matched.filter((f) => f.status === "processed").length;
    const liveCompletude = fileCount > 0
      ? Math.round((docsParsed / fileCount) * 100)
      : 0;
    const completude = Math.max(Number(topic.completude) || 0, liveCompletude);
    const status = fileCount === 0
      ? "pendente"
      : completude >= 100
      ? "completo"
      : "incompleto";

    return { ...topic, fileCount, docsParsed, completude, status };
  });
}

function computeRmaScore(topics: ScoreTopic[], baseline = 0) {
  const list = Array.isArray(topics) ? topics : [];
  const total = list.length || 1;
  const completos = list.filter((t) => t.status === "completo").length;
  const incompletos = list.filter((t) => t.status === "incompleto").length;
  const pendentes = list.filter((t) => t.status === "pendente").length;
  const weightedStatus = Math.round(
    ((completos * 1 + incompletos * 0.5) / total) * 100,
  );
  const liveAvg = list.length > 0
    ? Math.round(
      list.reduce((s, t) => s + (Number(t.completude) || 0), 0) / list.length,
    )
    : 0;
  const combined = Math.round((weightedStatus + liveAvg) / 2);
  const safeBaseline = Math.max(0, Math.min(100, Number(baseline) || 0));
  const percentual = Math.max(
    0,
    Math.min(100, Math.max(combined, weightedStatus, liveAvg, safeBaseline)),
  );
  return {
    percentual,
    weightedStatus,
    liveAvg,
    combined,
    baseline: safeBaseline,
    totals: { total: list.length, completos, incompletos, pendentes },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(
        JSON.stringify({ error: "unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let body: { companyIds?: string[] } = {};
    try {
      body = await req.json();
    } catch (_) { /* empty body OK */ }

    let analysisQuery = supabase
      .from("rma_analysis_results")
      .select("company_id, percentual, topics");
    if (Array.isArray(body.companyIds) && body.companyIds.length > 0) {
      analysisQuery = analysisQuery.in("company_id", body.companyIds);
    }
    const { data: analyses, error: aErr } = await analysisQuery;
    if (aErr) throw aErr;

    // União: empresas com análise + empresas explicitamente solicitadas.
    // Garante que RMAs sem rma_analysis_results ainda recebam um score
    // calculado a partir dos arquivos do OneDrive (fallback canônico).
    const requested = Array.isArray(body.companyIds) ? body.companyIds.filter(Boolean) : [];
    const companyIds = Array.from(
      new Set([
        ...(analyses ?? []).map((a: any) => a.company_id).filter(Boolean),
        ...requested,
      ]),
    );

    let files: ScoreFile[] = [];
    if (companyIds.length > 0) {
      const { data: filesData, error: fErr } = await supabase
        .from("onedrive_files")
        .select("company_id, path, file_name, status")
        .in("company_id", companyIds);
      if (fErr) throw fErr;
      files = (filesData ?? []) as ScoreFile[];
    }

    const filesByCompany = files.reduce<Record<string, ScoreFile[]>>(
      (acc, f) => {
        if (!f.company_id) return acc;
        (acc[f.company_id] ||= []).push(f);
        return acc;
      },
      {},
    );

    const analysisByCompany = new Map<string, any>();
    for (const a of (analyses ?? []) as any[]) {
      if (a.company_id) analysisByCompany.set(a.company_id, a);
    }

    const scores: Record<string, any> = {};
    for (const cid of companyIds) {
      const a = analysisByCompany.get(cid);
      const liveTopics = buildLiveScoreTopics(
        (a?.topics ?? null) as ScoreTopic[],
        filesByCompany[cid],
      );
      const result = computeRmaScore(liveTopics, a?.percentual ?? 0);
      scores[cid] = { ...result, topics: liveTopics };
    }

    return new Response(
      JSON.stringify({ scores, computedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "internal_error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
