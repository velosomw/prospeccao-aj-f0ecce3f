import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, RefreshCw, Sparkles, Download, ExternalLink, Loader2,
  CheckCircle2, AlertTriangle, Activity, ShieldCheck, History, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRmaDocument } from "@/hooks/useRmaDocument";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import OficioPendenciasCard from "./OficioPendenciasCard";
import RelatorioCanonicalPreview from "@/components/prospeccao/document/RelatorioCanonicalPreview";

interface Props {
  prospeccaoId: string;
  scoreFinal: number;
  companyId: string | null;
  prospeccaoCode?: string;
  empresa?: string;
  mesReferencia?: string;
  responsavel?: string;
}

type DipState = "construcao" | "consolidacao" | "final";

const STATE_META: Record<DipState, { label: string; color: string; icon: any; desc: string }> = {
  construcao: {
    label: "Em Construção",
    color: "bg-amber-500",
    icon: AlertTriangle,
    desc: "Dados incompletos · documentos sendo processados · pendências em aberto.",
  },
  consolidacao: {
    label: "Em Consolidação",
    color: "bg-blue-600",
    icon: Activity,
    desc: "Dados conciliados · divergências revisadas · pronto para fechamento.",
  },
  final: {
    label: "DIP Final",
    color: "bg-emerald-600",
    icon: ShieldCheck,
    desc: "Todos os documentos obrigatórios processados · relatório oficial emitido.",
  },
};

function computeState(scoreFinal: number, hasReport: boolean, aprovadoPct: number): DipState {
  if (hasReport && scoreFinal >= 95 && aprovadoPct >= 90) return "final";
  if (scoreFinal >= 67) return "consolidacao";
  return "construcao";
}

/**
 * Fase 6 — Relatório Prospeccao · MD-DIP-REPORT-001
 * Relatório DIP dinâmico, incremental e auditável (Em Construção → Consolidação → Final).
 */
export default function StageRelatorioProspeccao({
  prospeccaoId, scoreFinal, companyId, prospeccaoCode, empresa, mesReferencia, responsavel,
}: Props) {
  const { doc, sections, progresso, aprovadoPct, regenerateFinal, buildCharts, reload } =
    useRmaDocument(prospeccaoId, "prospeccao_mensal", "Relatório Mensal de Atividade (CNJ 72/2020)");

  const [busy, setBusy] = useState<null | "gerar" | "atualizar">(null);
  const [phase, setPhase] = useState<string>("");
  const [analysis, setAnalysis] = useState<any | null>(null);
  const lastScoreRef = useRef<number>(scoreFinal);

  const hasReport = !!doc?.arquivo_final_url;
  const versao = doc?.arquivo_final_versao ?? 0;
  const geradoEm = doc?.arquivo_final_gerado_em
    ? new Date(doc.arquivo_final_gerado_em).toLocaleString("pt-BR")
    : null;

  const totalSecoes = sections.length;
  const secoesConcluidas = useMemo(
    () => sections.filter((s) => s.status === "aprovado" || s.status === "concluido").length,
    [sections],
  );

  // Carrega dados de análise para alimentar dashboard (Kanitz, pendências, confiança)
  useEffect(() => {
    if (!companyId) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("prospeccao_analysis_results")
        .select("percentual, kanitz, pendencias, indicadores, score_rj, topics, diagnostico")
        .eq("company_id", companyId)
        .maybeSingle();
      if (!cancel) setAnalysis(data ?? null);
    })();
    return () => { cancel = true; };
  }, [companyId, doc?.arquivo_final_pct]);

  const estado = computeState(scoreFinal, hasReport, aprovadoPct);
  const StateIcon = STATE_META[estado].icon;

  // Atualização Contínua — se score subiu desde o último relatório, sugere atualizar
  const precisaAtualizar =
    hasReport &&
    doc?.arquivo_final_pct != null &&
    scoreFinal - (doc.arquivo_final_pct ?? 0) >= 5;

  // KPIs do Dashboard
  // FONTE CANÔNICA: prospeccao_analysis_results.diagnostico.pipeline reflete o pipeline real
  // (onedrive_files únicos: ok / total / manual / pending). Somar por tópico contaria
  // o mesmo arquivo várias vezes (um arquivo pode pertencer a N tópicos) — por isso
  // víamos "174/258" enquanto o real é 173/189 para 01/2026 — DIPLOMATA.
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
  const confiabilidade = (() => {
    const sec = sections.filter((s) => s.grounding_score != null);
    if (!sec.length) return null;
    return Math.round(sec.reduce((a, s) => a + (s.grounding_score ?? 0), 0) / sec.length);
  })();
  const kanitzAtual = analysis?.kanitz?.fi ?? analysis?.kanitz?.score ?? null;
  const healthScore = (() => {
    if (scoreFinal >= 90) return "AA";
    if (scoreFinal >= 75) return "A";
    if (scoreFinal >= 60) return "BB";
    if (scoreFinal >= 45) return "B";
    return "C";
  })();

  async function runPipeline(mode: "gerar" | "atualizar") {
    if (!doc) {
      toast({ title: "Documento Prospeccao AJ não inicializado", variant: "destructive" });
      return;
    }
    setBusy(mode);
    try {
      setPhase("Gerando KPIs e gráficos…");
      await buildCharts(true);

      setPhase("Contextualizando seções via IA…");
      // Agrupa todas as seções num único request — reduz overhead, reaproveita
      // dados da empresa e maximiza HIT do llm_response_cache.
      const { data: batchData, error: batchErr } = await supabase.functions.invoke(
        "prospeccao-doc-section-regenerate",
        { body: { section_ids: sections.map((s) => s.id), force: true } },
      );
      const falhas = batchErr
        ? sections.length
        : (batchData?.failed ?? 0);
      if (falhas > 0) {
        toast({
          title: "Algumas seções falharam",
          description: `${falhas} de ${sections.length} seções não regeneradas`,
        });
      }

      setPhase("Consolidando relatório final (.docx)…");
      await regenerateFinal(true);
      await reload();
      lastScoreRef.current = scoreFinal;

      toast({
        title: mode === "gerar" ? "Relatório gerado" : "Relatório atualizado",
        description: `Versão ${versao + 1} · ${secoesConcluidas}/${totalSecoes} seções consolidadas`,
      });
    } catch (e: any) {
      toast({ title: "Falha ao processar relatório", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
      setPhase("");
    }
  }

  // dashboardCards e toneClass foram movidos para RmaDipKpiCards (aba Processamento).

  return (
    <div className="space-y-4">
      {/* Ofício de Pendências — emissão independente */}
      <OficioPendenciasCard
        analysis={analysis}
        prospeccaoCode={prospeccaoCode || prospeccaoId}
        mesReferencia={mesReferencia}
        empresa={empresa}
        responsavel={responsavel}
      />

      {/* Cabeçalho + Estado DIP */}
      <div className="bg-white border border-border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[hsl(217,91%,50%)] text-white flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Relatório DIP — Prospeccao AJ</h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Relatório Mensal de Atividade (CNJ 72/2020) — objeto vivo de consolidação processual.
                Dados extraídos são continuamente incorporados, revisados e consolidados até a versão
                oficial.
              </p>
              <div className="flex gap-2 mt-3 flex-wrap items-center">
                <Badge className={`${STATE_META[estado].color} text-white gap-1`}>
                  <StateIcon className="h-3 w-3" />
                  {STATE_META[estado].label}
                </Badge>
                {hasReport && <Badge variant="outline">Versão {versao}</Badge>}
                {precisaAtualizar && (
                  <Badge className="bg-amber-500 text-white">Atualização disponível</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">{STATE_META[estado].desc}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {!hasReport && (
              <Button
                onClick={() => runPipeline("gerar")}
                disabled={!!busy || totalSecoes === 0}
                className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]"
              >
                {busy === "gerar" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Gerar Relatório
              </Button>
            )}
            {hasReport && (
              <>
                <Button
                  variant={precisaAtualizar ? "default" : "outline"}
                  onClick={() => runPipeline("atualizar")}
                  disabled={!!busy}
                  className={precisaAtualizar ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
                >
                  {busy === "atualizar" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Atualizar Relatório
                </Button>
                <a href={doc!.arquivo_final_url!} target="_blank" rel="noreferrer">
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Baixar .docx
                  </Button>
                </a>
              </>
            )}
          </div>
        </div>

        {busy && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {phase || "Processando…"}
          </div>
        )}
      </div>

      {/* Dashboard DIP — movido para a aba Processamento */}

      {/* Histórico de versões + Atualização contínua */}
      <div className="bg-white border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-base font-bold text-foreground">Histórico de Versões</h3>
        </div>
        {!hasReport ? (
          <p className="text-sm text-muted-foreground">Nenhuma versão emitida ainda.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm border border-border rounded px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <strong>Versão {versao}</strong>
                {geradoEm && <span className="text-muted-foreground">· {geradoEm}</span>}
                <Badge variant="outline" className="ml-2">
                  {doc?.arquivo_final_pct ?? 0}% concluído
                </Badge>
              </div>
              <a
                href={doc!.arquivo_final_url!}
                target="_blank"
                rel="noreferrer"
                className="text-[hsl(217,91%,50%)] hover:underline inline-flex items-center gap-1 text-xs"
              >
                Abrir <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            {precisaAtualizar && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-2">
                <Database className="h-3 w-3" />
                Novos dados foram incorporados desde a última versão ({doc?.arquivo_final_pct}% →{" "}
                {scoreFinal}%). Clique em <strong>Atualizar Relatório</strong> para regerar.
              </div>
            )}
          </div>
        )}
      </div>




      {/* Visualizador */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h3 className="text-base font-bold text-foreground mb-3">Visualização do Relatório</h3>
        {!hasReport ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              Nenhum relatório gerado ainda. Clique em <strong>Gerar Relatório</strong> para
              produzir o Prospeccao com os dados atualmente carregados.
            </p>
          </div>
        ) : (
          <iframe
            title="Relatório Prospeccao AJ"
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(
              doc!.arquivo_final_url!,
            )}&embedded=true`}
            className="w-full h-[800px] border border-border rounded"
          />
        )}
      </div>

      {/* Prévia estruturada DIP-Prospeccao — Capa → Carta ao Juízo → Sumário → Seções */}
      <RelatorioCanonicalPreview
        empresa={empresa}
        prospeccaoCode={prospeccaoCode || prospeccaoId}
        mesReferencia={mesReferencia}
        responsavel={responsavel}
        sections={sections as any}
      />
    </div>
  );
}
