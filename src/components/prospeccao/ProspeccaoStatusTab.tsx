import { useEffect, useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, Clock, Loader2, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { buildLiveScoreTopics, computeRmaScore } from "@/lib/prospeccaoScore";
import { reconcileScore, useScoreParityGuard } from "@/lib/scoreSync";
import type { ProspeccaoEntry } from "@/types/prospeccao";
import type { RmaAnalysisResult } from "@/services/prospeccaoAnalysisService";

interface Props {
  prospeccao: ProspeccaoEntry;
  companyId?: string | null;
  onUpdateIA: () => void;
  isAnalyzing?: boolean;
  analysis?: RmaAnalysisResult | null;
}

type StatusFilter = "all" | "completo" | "pendente" | "incompleto";

interface OneDriveFile { path: string; file_name: string; status: string | null }

const ProspeccaoStatusTab = ({ prospeccao, companyId, onUpdateIA, isAnalyzing = false, analysis }: Props) => {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [allFiles, setAllFiles] = useState<OneDriveFile[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mesma fonte de verdade da aba Processamento IA: onedrive_files agrupado por número de pasta.
  // Auto-refresh a cada 5s para refletir progresso do worker assíncrono em background,
  // sem precisar clicar em "Atualizar Status IA".
  useEffect(() => {
    if (!companyId) { setAllFiles(null); return; }
    let cancelled = false;
    const fetchFiles = async () => {
      // Busca a competência ativa da empresa para limitar o escopo do Prospeccao
      const { data: comp } = await supabase
        .from("companies")
        .select("execution_year, current_period_month")
        .eq("id", companyId)
        .maybeSingle();
      let q = supabase
        .from("onedrive_files")
        .select("path, file_name, status, ano, mes")
        .eq("company_id", companyId)
        .neq("status", "inactive")
        .order("path", { ascending: true });
      if (comp?.execution_year && comp?.current_period_month) {
        q = q.eq("ano", comp.execution_year).eq("mes", comp.current_period_month);
      }
      const { data } = await q.limit(2000);
      if (!cancelled) setAllFiles((data as any) || []);
    };
    fetchFiles();
    const interval = window.setInterval(fetchFiles, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [companyId, isAnalyzing, refreshTick]);

  const handleRefreshScore = async () => {
    setIsRefreshing(true);
    setRefreshTick((n) => n + 1);
    // pequena janela visual + tempo para o fetch acima resolver
    setTimeout(() => setIsRefreshing(false), 900);
  };

  const liveTopics = useMemo(() => {
    const base = analysis?.topics?.length
      ? analysis.topics.map((t) => ({
          id: `t${t.number}`,
          number: t.number as number,
          name: t.name,
          status: t.status,
          completude: t.completude,
          processing: t.processing,
          fileCount: t.fileCount,
          docsParsed: t.docsParsed,
          errors: t.errors,
        }))
      : prospeccao.topics.map((t: any, i: number) => ({
          id: t.id,
          number: (t.number ?? t.pasta ?? i + 1) as number,
          name: t.name,
          status: t.status as "completo" | "pendente" | "incompleto",
          completude: t.completude,
          processing: false,
          fileCount: 0,
          docsParsed: 0,
          errors: [] as string[],
        }));

    // Sobrescreve fileCount/docsParsed/completude/status com os números reais do OneDrive.
    // A completude por tópico passa a refletir docsParsed/fileCount em tempo real
    // (e não apenas o snapshot da última run completa de prospeccao-analyze).
    return buildLiveScoreTopics(base, allFiles) as typeof base;
  }, [analysis, prospeccao.topics, allFiles]);

  const completos = liveTopics.filter((t) => t.status === "completo");
  const pendentes = liveTopics.filter((t) => t.status === "pendente");
  const incompletos = liveTopics.filter((t) => t.status === "incompleto");
  const processandoAtual = liveTopics.find((t) => t.processing);

  // Score Global unificado: `prospeccao.percentual` é a fonte canônica (vinda do
  // Workspace/edge `prospeccao-score`). reconcileScore garante paridade em runtime.
  const localScore = computeRmaScore(liveTopics as any, analysis?.percentual ?? 0);
  const avgCompletude = reconcileScore("ProspeccaoStatusTab", prospeccao.percentual, localScore);
  useScoreParityGuard(prospeccao.id ?? null, "ProspeccaoStatusTab", avgCompletude);

  const totalProcessados = completos.length + incompletos.length;
  const totalEsperado = liveTopics.length;

  const filterButtons: { type: StatusFilter; icon: typeof CheckCircle2; color: string; count: number; label: string }[] = [
    { type: "completo", icon: CheckCircle2, color: "hsl(142,76%,36%)", count: completos.length, label: "Completos" },
    { type: "incompleto", icon: XCircle, color: "hsl(0,84%,60%)", count: incompletos.length, label: "Incompletos" },
    { type: "pendente", icon: AlertTriangle, color: "hsl(38,92%,50%)", count: pendentes.length, label: "Pendentes" },
  ];

  return (
    <div className="space-y-6">
      {/* Botão Atualizar */}
      <div className="flex justify-end gap-2">
        <Button
          onClick={handleRefreshScore}
          disabled={isRefreshing}
          variant="outline"
          className="gap-2"
          title="Recarrega imediatamente os percentuais e o score global a partir do banco"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Atualizando…" : "Atualizar Score Agora"}
        </Button>
        <Button
          onClick={onUpdateIA}
          disabled={isAnalyzing}
          className="gap-2 bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white disabled:opacity-80"
        >
          <RefreshCw className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : ""}`} />
          {isAnalyzing ? "Em Análise…" : "Atualizar Status IA"}
        </Button>
      </div>



      {/* Status Geral + Progresso em tempo real */}
      <Card className="border-2 border-[hsl(217,91%,50%)]/20">
        <CardContent className="p-6 space-y-4">
          <div className="text-center">
            <p className="text-5xl font-bold text-[hsl(217,91%,50%)]">{avgCompletude}%</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isAnalyzing ? "IA processando documentos…" : "Status Geral do Prospeccao"}
            </p>
          </div>

          {/* Barra de progresso animada */}
          <div className="space-y-2">
            <Progress value={avgCompletude} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {totalProcessados} de {totalEsperado} tópicos processados
              </span>
              <span className="font-mono font-semibold">{avgCompletude}%</span>
            </div>
          </div>

          {/* Tópico em processamento (live) */}
          {isAnalyzing && processandoAtual && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[hsl(217,91%,50%)]/8 border border-[hsl(217,91%,50%)]/20 animate-pulse">
              <Loader2 className="w-4 h-4 text-[hsl(217,91%,50%)] animate-spin" />
              <span className="text-sm text-foreground">
                Processando: <span className="font-semibold">{processandoAtual.name}</span>
              </span>
            </div>
          )}

          {/* Faixas de classificação */}
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide">
              <span className="text-[hsl(0,84%,60%)]">Crítico 0-33</span>
              <span className="text-[hsl(38,92%,50%)]">Moderado 33-67</span>
              <span className="text-[hsl(142,76%,36%)]">Excelente 67-100</span>
            </div>
            <div className="relative h-4 rounded-full flex">
              <div className="h-full rounded-l-full bg-[hsl(0,84%,60%)]" style={{ width: "33%" }} />
              <div className="h-full bg-[hsl(45,100%,60%)]" style={{ width: "34%" }} />
              <div className="h-full rounded-r-full bg-[hsl(142,76%,45%)]" style={{ width: "33%" }} />
              <div
                className="absolute -top-1 h-6 w-[4px] rounded-sm bg-foreground shadow-md transition-all duration-500"
                style={{ left: `${avgCompletude}%`, transform: "translateX(-50%)" }}
                title={`${avgCompletude}%`}
              />
            </div>
          </div>

          <div className="flex justify-center gap-6 text-sm flex-wrap">
            <span className="flex items-center gap-1.5 text-[hsl(142,76%,36%)]">
              <CheckCircle2 className="w-4 h-4" /> {completos.length} completos
            </span>
            <span className="flex items-center gap-1.5 text-[hsl(0,84%,60%)]">
              <XCircle className="w-4 h-4" /> {incompletos.length} incompletos
            </span>
            <span className="flex items-center gap-1.5 text-[hsl(38,92%,50%)]">
              <AlertTriangle className="w-4 h-4" /> {pendentes.length} pendentes
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterButtons.map((fb) => {
          const Icon = fb.icon;
          return (
            <button
              key={fb.type}
              onClick={() => setFilter(filter === fb.type ? "all" : fb.type)}
              className="relative cursor-pointer transition-all duration-200 flex items-center gap-2"
              title={`${fb.label} (${fb.count})`}
              style={{
                opacity: filter === "all" || filter === fb.type ? 1 : 0.4,
                transform: filter === fb.type ? "scale(1.05)" : "scale(1)",
              }}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ backgroundColor: fb.color }}
              >
                <Icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs font-semibold" style={{ color: fb.color }}>
                {fb.count} {fb.label}
              </span>
              {filter === fb.type && (
                <div className="absolute -bottom-1 left-4 w-5 h-0.5 rounded-full" style={{ backgroundColor: fb.color }} />
              )}
            </button>
          );
        })}
        {filter !== "all" && (
          <button
            onClick={() => setFilter("all")}
            className="text-[10px] text-muted-foreground hover:text-foreground ml-1 underline cursor-pointer"
          >
            Ver todos
          </button>
        )}
      </div>

      {/* Lista única de tópicos em tempo real */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Tópicos do Prospeccao — atualização em tempo real
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {liveTopics.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum tópico carregado ainda.</p>
          ) : (
            liveTopics
              .filter((t) => filter === "all" || t.status === filter)
              .map((t) => {
                const color =
                  t.status === "completo"
                    ? "hsl(142,76%,36%)"
                    : t.status === "incompleto"
                      ? "hsl(0,84%,60%)"
                      : "hsl(38,92%,50%)";
                const Icon =
                  t.status === "completo" ? CheckCircle2 : t.status === "incompleto" ? XCircle : AlertTriangle;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-lg border transition-all duration-300"
                    style={{
                      backgroundColor: t.processing
                        ? "color-mix(in srgb, hsl(217,91%,50%) 8%, white)"
                        : `color-mix(in srgb, ${color} 5%, white)`,
                      borderColor: t.processing
                        ? "hsl(217,91%,50%)"
                        : `color-mix(in srgb, ${color} 25%, white)`,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {t.processing ? (
                        <Loader2 className="w-4 h-4 text-[hsl(217,91%,50%)] animate-spin flex-shrink-0" />
                      ) : (
                        <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                      )}
                      <span className="text-sm font-medium text-foreground truncate">{t.name}</span>
                      {t.processing && (
                        <Badge className="text-[10px] bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)] border-0 animate-pulse">
                          processando
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {t.fileCount > 0 && (
                        <span className="text-sm text-muted-foreground font-mono font-semibold min-w-[70px] text-right">
                          {t.docsParsed}/{t.fileCount} docs
                        </span>
                      )}
                      <Progress value={t.completude} className="h-3 w-40" />
                      <span className="text-base font-mono font-bold text-foreground w-14 text-right">{t.completude}%</span>
                    </div>
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>

      {/* Log live */}
      {isAnalyzing && analysis?.log && analysis.log.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Log de execução</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-[11px] text-muted-foreground space-y-0.5 max-h-40 overflow-y-auto">
              {analysis.log.slice(-15).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProspeccaoStatusTab;
