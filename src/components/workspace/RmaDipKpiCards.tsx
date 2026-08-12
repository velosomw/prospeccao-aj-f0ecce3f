import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-any";
import { useProspeccaoDocument } from "@/hooks/useProspeccaoDocument";

interface Props {
  prospeccaoId: string;
  companyId: string | null;
  scoreFinal: number;
}

const toneClass = (t: string) =>
  t === "emerald"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : t === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : t === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : "border-blue-200 bg-blue-50 text-blue-900";

export default function RmaDipKpiCards({ prospeccaoId, companyId, scoreFinal }: Props) {
  const { sections, progresso, doc } = useProspeccaoDocument(
    prospeccaoId,
    "prospeccao_mensal",
    "Relatório Mensal de Atividade (CNJ 72/2020)",
  );
  const [analysis, setAnalysis] = useState<any | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("prospeccao_analysis_results")
        .select("percentual, pendencias, indicadores, score_rj, topics, diagnostico")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!cancel) setAnalysis(data ?? null);
    })();
    return () => { cancel = true; };
  }, [companyId, doc?.arquivo_final_pct]);

  const topicsArr: any[] = Array.isArray(analysis?.topics) ? analysis.topics : [];
  const pipelineStats = (analysis?.diagnostico as any)?.pipeline ?? null;
  const docsProcessados = Number(pipelineStats?.ok ?? 0);
  const docsTotal = Number(
    pipelineStats?.total
      ?? topicsArr.reduce((acc, t) => acc + Math.max(t?.fileCount ?? 0, t?.docsParsed ?? 0), 0),
  );
  const pendenciasCount = Array.isArray(analysis?.pendencias)
    ? analysis.pendencias.length
    : topicsArr.filter((t) => t?.status === "pendente" || t?.status === "incompleto").length;
  const confiabilidade = useMemo(() => {
    const sec = sections.filter((s) => s.grounding_score != null);
    if (!sec.length) return null;
    return Math.round(sec.reduce((a, s) => a + (s.grounding_score ?? 0), 0) / sec.length);
  }, [sections]);
  const indicators = analysis?.indicadores ?? null;
  const healthScore =
    scoreFinal >= 90 ? "AA" :
    scoreFinal >= 75 ? "A" :
    scoreFinal >= 60 ? "BB" :
    scoreFinal >= 45 ? "B" : "C";

  const cards = [
    {
      label: "Completude do Relatório",
      value: `${scoreFinal}%`,
      hint: `Documento: ${progresso}%`,
      tone: scoreFinal >= 67 ? "emerald" : scoreFinal >= 33 ? "amber" : "rose",
    },
    {
      label: "Documentos Processados",
      value: docsTotal > 0 ? `${docsProcessados} / ${docsTotal}` : "—",
      hint: `${topicsArr.length} tópicos`,
      tone: "blue",
    },
    {
      label: "Pendências",
      value: pendenciasCount.toString(),
      hint: pendenciasCount === 0 ? "Sem pendências" : "Itens em aberto",
      tone: pendenciasCount === 0 ? "emerald" : pendenciasCount > 10 ? "rose" : "amber",
    },
    {
      label: "Confiabilidade IA",
      value: confiabilidade != null ? `${confiabilidade}%` : "—",
      hint: "Grounding médio das seções",
      tone: (confiabilidade ?? 0) >= 80 ? "emerald" : (confiabilidade ?? 0) >= 60 ? "amber" : "rose",
    },
    {
      label: "Kanitz Atual",
      value: kanitzAtual != null ? Number(kanitzAtual).toFixed(2) : "—",
      hint: "Fator de Insolvência",
      tone: (kanitzAtual ?? 0) > 0 ? "emerald" : (kanitzAtual ?? 0) > -3 ? "amber" : "rose",
    },
    {
      label: "Health Score Prospeccao AJ",
      value: healthScore,
      hint: `Baseado em ${scoreFinal}%`,
      tone: ["AA", "A"].includes(healthScore) ? "emerald" : healthScore === "BB" ? "amber" : "rose",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`border rounded-lg p-4 ${toneClass(c.tone)}`}>
          <div className="text-xs font-medium opacity-70">{c.label}</div>
          <div className="text-2xl font-bold mt-1">{c.value}</div>
          <div className="text-xs opacity-70 mt-1">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
