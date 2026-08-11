import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Activity, Cpu, BookOpen, Search, BarChart3, FileText, FileCheck,
  GitBranch, Award, ShieldCheck, Database, GitMerge, Scale, LineChart, Camera
} from "lucide-react";
import ProspeccaoSnapshotMensalTab from "@/components/prospeccao/ProspeccaoSnapshotMensalTab";
import ProspeccaoBalancoTab from "@/components/prospeccao/ProspeccaoBalancoTab";
import ProspeccaoDRETab from "@/components/prospeccao/ProspeccaoDRETab";
import CompetenciaSelector, { type Competencia } from "@/components/prospeccao/CompetenciaSelector";
import { Badge } from "@/components/ui/badge";
import PlatformLayout from "@/components/PlatformLayout";
import type { ProspeccaoEntry } from "@/types/prospeccao";
import { supabase } from "@/integrations/supabase/client";
import {
  startProspeccaoAnalysis,
  getRmaAnalysis,
  type ProspeccaoAnalysisResult,
} from "@/services/prospeccaoAnalysisService";
import { buildLiveScoreTopics, computeRmaScore, fetchRmaScores, type ScoreFile } from "@/lib/prospeccaoScore";
import { reconcileScore, useScoreParityGuard } from "@/lib/scoreSync";
import ProspeccaoStatusTab from "@/components/prospeccao/ProspeccaoStatusTab";
import ProspeccaoProcessamentoTab from "@/components/prospeccao/ProspeccaoProcessamentoTab";
import ProspeccaoBalanceteTab from "@/components/prospeccao/ProspeccaoBalanceteTab";
import ProspeccaoAnaliseTab from "@/components/prospeccao/ProspeccaoAnaliseTab";
import ProspeccaoParecerTab from "@/components/prospeccao/ProspeccaoParecerTab";
import ProspeccaoRelatorioTab from "@/components/prospeccao/ProspeccaoRelatorioTab";
import ProspeccaoEvolucaoTab from "@/components/prospeccao/ProspeccaoEvolucaoTab";
import ProspeccaoParecerFinalTab from "@/components/prospeccao/ProspeccaoParecerFinalTab";
import ProspeccaoRelatorioFinalTab from "@/components/prospeccao/ProspeccaoRelatorioFinalTab";
import { useUserRoles } from "@/hooks/useUserRoles";


import FinancialInsightsPanel from "@/components/prospeccao/FinancialInsightsPanel";
import { useConsolidadoBS } from "@/hooks/useConsolidadoBS";
import WindowSelector, { type Janela, computeJanelaRange, janelaLabel } from "@/components/prospeccao/WindowSelector";

import JourneyStepper, { type JourneyStep } from "@/components/shell/JourneyStepper";
import ScoreRingCard from "@/components/workspace/ScoreRingCard";
import ProcessingProgressCard from "@/components/workspace/ProcessingProgressCard";
import PendenciasResumoCard from "@/components/workspace/PendenciasResumoCard";
import SaudeRelatorioCard from "@/components/workspace/SaudeRelatorioCard";
import WorkspaceOverviewDashboard from "@/components/workspace/WorkspaceOverviewDashboard";
import IAActivityTimeline from "@/components/workspace/IAActivityTimeline";
import IATipCard from "@/components/workspace/IATipCard";
import { TopicsTaskList, type TopicItem, type TopicSeverity, type TopicStatus } from "@/components/workspace/TopicsTaskList";
import StageDadosUpload from "@/components/workspace/stages/StageDadosUpload";
import StageProcessamentoIA from "@/components/workspace/stages/StageProcessamentoIA";
import StageRevisaoInteligente from "@/components/workspace/stages/StageRevisaoInteligente";
import StageFechamento from "@/components/workspace/stages/StageFechamento";
import StageRelatorioProspeccao from "@/components/workspace/stages/StageRelatorioProspeccao";
import AuditoriaCard from "@/components/workspace/AuditoriaCard";


const tabConfig = [
  { value: "status", label: "Status Prospeccao AJ", icon: Activity, color: "hsl(217,91%,50%)" },
  { value: "processamento", label: "Processamento IA", icon: Cpu, color: "hsl(258,90%,56%)" },
  { value: "analise", label: "Registro e Cobrança", icon: Search, color: "hsl(38,92%,50%)" },
  { value: "balancete", label: "Balancete", icon: BookOpen, color: "hsl(142,76%,36%)" },
  { value: "bs", label: "Balanço Patrimonial", icon: Scale, color: "hsl(217,91%,50%)" },
  { value: "pnl", label: "P&L (DRE)", icon: LineChart, color: "hsl(258,90%,56%)" },
  { value: "analise-tecnica", label: "Análise Técnica", icon: GitMerge, color: "hsl(38,92%,50%)" },
  { value: "dashboards", label: "Gráficos de Auditoria", icon: BarChart3, color: "hsl(217,91%,50%)" },
  { value: "relatorio", label: "Revisão-Relatório Prospeccao AJ", icon: FileCheck, color: "hsl(280,60%,50%)" },
  { value: "evolucao", label: "Evolução Prospeccao AJ", icon: GitBranch, color: "hsl(170,60%,40%)" },
  { value: "snapshot", label: "Snapshot Mensal", icon: Camera, color: "hsl(217,91%,40%)" },
  { value: "relatorio-final", label: "Relatório Prospeccao AJ Final", icon: ShieldCheck, color: "hsl(142,76%,30%)" },
];


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parseDipCompetencia = (code?: string | null): Competencia | null => {
  const match = String(code || "").match(/^Prospeccao-DIP-(\d{2})-(\d{4})$/i);
  if (!match) return null;
  const mes = Number(match[1]);
  const ano = Number(match[2]);
  if (!ano || !mes || mes < 1 || mes > 12) return null;
  const key = `${ano}-${String(mes).padStart(2, "0")}`;
  const label = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  return { ano, mes, key, label };
};

const isRecentAnalysisRun = (updatedAt?: string | null) => {
  if (!updatedAt) return false;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < 15 * 60 * 1000;
};

const ProspeccaoWorkspace = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { roles, loading: rolesLoading } = useUserRoles();
  const isRecuperanda = roles.includes("recuperanda");
  const isMagistrado = roles.includes("magistrado");
  const visibleTabs = isMagistrado
    ? (["relatorio-final", "dashboards"]
        .map(v => tabConfig.find(t => t.value === v)!)
        .filter(Boolean))
    : isRecuperanda
      ? tabConfig
          .filter(t => ["processamento", "dashboards", "relatorio-final"].includes(t.value))
          .map(t => t.value === "processamento" ? { ...t, label: "Processamento" } : t)
      : tabConfig;
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  useEffect(() => {
    if (rolesLoading) return;
    if (activeTab && visibleTabs.some(t => t.value === activeTab)) return;
    setActiveTab(isMagistrado ? "relatorio-final" : isRecuperanda ? "processamento" : "status");
  }, [rolesLoading, isMagistrado, isRecuperanda, activeTab, visibleTabs]);
  const [competencia, setCompetencia] = useState<Competencia | null>(null);
  // Persistência da janela com cadeia de fallback (composite > company > prospeccao > last > default).
  // Lê uma janela válida no localStorage para a chave dada. Retorna null se ausente/inválida.
  const readStoredJanelaRaw = useCallback((key: string): Janela | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const n = Number(raw);
      if ([1, 3, 6, 12].includes(n)) return n as Janela;
    } catch {}
    return null;
  }, []);
  // Resolve a janela com cadeia de fallback:
  //   1) chave composta (companyId + prospeccaoCode/id) — mais específica
  //   2) chave por companyId — preserva escolha entre Prospeccoes da mesma empresa
  //   3) chave por id (Prospeccao) — preserva escolha mesmo sem companyId resolvido
  //   4) último valor usado globalmente
  //   5) default 3M
  // Garante que o usuário SEMPRE vê uma janela válida, mesmo antes de
  // companyId/prospeccaoCode carregarem; quando carregam, atualiza automaticamente.
  const resolveJanela = useCallback(
    (cid: string | null, rcode: string | null): Janela => {
      const composite = `bex:prospeccao:janela:${cid || "nocid"}:${rcode || id || "mock"}`;
      const byCompany = cid ? `bex:prospeccao:janela:${cid}:_any` : null;
      const byRma = `bex:prospeccao:janela:nocid:${rcode || id || "mock"}`;
      const last = `bex:prospeccao:janela:_last`;
      return (
        readStoredJanelaRaw(composite) ??
        (byCompany ? readStoredJanelaRaw(byCompany) : null) ??
        readStoredJanelaRaw(byRma) ??
        readStoredJanelaRaw(last) ??
        3
      );
    },
    [id, readStoredJanelaRaw],
  );
  const [janela, setJanela] = useState<Janela>(() => resolveJanela(null, null));
  const handleJanelaChange = (v: Janela) => {
    setJanela(v);
    const cid = companyIdRefForKey.current;
    const rcode = prospeccaoCodeRefForKey.current;
    try {
      // Persiste em todas as variantes para alimentar a cadeia de fallback.
      localStorage.setItem(`bex:prospeccao:janela:${cid || "nocid"}:${rcode || id || "mock"}`, String(v));
      if (cid) localStorage.setItem(`bex:prospeccao:janela:${cid}:_any`, String(v));
      localStorage.setItem(`bex:prospeccao:janela:nocid:${rcode || id || "mock"}`, String(v));
      localStorage.setItem(`bex:prospeccao:janela:_last`, String(v));
    } catch {}
  };
  const companyIdRefForKey = useRef<string | null>(null);
  const prospeccaoCodeRefForKey = useRef<string | null>(null);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [prospeccaoCode, setRmaCode] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProspeccaoAnalysisResult | null>(null);
  const [scoreFiles, setScoreFiles] = useState<ScoreFile[]>([]);
  const [prospeccaoPeriod, setRmaPeriod] = useState<{ ano: number; mes: number } | null>(null);
  const [overviewFiles, setOverviewFiles] = useState<ScoreFile[]>([]);
  const [unifiedScore, setUnifiedScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const lastRouteRef = useRef<string | null>(null);
  const officialCompetenciaAppliedRef = useRef<string | null>(null);
  // Token de "run concluída com sucesso": muda apenas quando a análise IA
  // termina com status=concluido. Usado como `key` para forçar remount/refetch
  // de TODAS as abas dependentes (Status, Processamento, Balancete, BS&Dados),
  // garantindo que nenhuma aba mostre dados parciais durante uma run em_analise.
  const [runToken, setRunToken] = useState<string>("initial");
  const lastFinishedRef = useRef<string | null>(null);
  const lastUpdatedRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastRouteRef.current === id) return;
    lastRouteRef.current = id ?? null;
    officialCompetenciaAppliedRef.current = null;
    lastFinishedRef.current = null;
    lastUpdatedRef.current = null;
    setCompanyId(null);
    setCompanyName(null);
    setRmaCode(null);
    setAnalysis(null);
    setScoreFiles([]);
    setOverviewFiles([]);
    setUnifiedScore(null);
    setRmaPeriod(null);
    setCompetencia(parseDipCompetencia(id));
    setRunToken("initial");
  }, [id]);

  // Atualiza refs e re-resolve a janela quando companyId/prospeccaoCode chegam.
  // A janela exibida sempre é válida: começa pelo fallback global e converge
  // para a preferência específica do Prospeccao assim que os IDs são carregados.
  useEffect(() => {
    companyIdRefForKey.current = companyId;
    prospeccaoCodeRefForKey.current = prospeccaoCode;
    setJanela(resolveJanela(companyId, prospeccaoCode));
  }, [id, companyId, prospeccaoCode, resolveJanela]);

  // Intervalo derivado da janela global, ancorado na competência selecionada.
  // Memoizado para que mudanças em `competencia` ou `janela` propaguem
  // imediatamente para BS, DRE e Gráficos sem reidentificar o objeto a cada render.
  const janelaRange = useMemo(
    () => computeJanelaRange(competencia, janela),
    [competencia?.ano, competencia?.mes, janela],
  );
  // BS & Dados — consolidado já filtrado pela janela (alimenta Gráficos de Auditoria).
  const { parsed: bsParsed, entries: bsEntries, loading: bsLoading } = useConsolidadoBS(companyId, runToken, janelaRange);

  // Route id pode ser UUID OU código prospeccao_id (ex.: Prospeccao-DIP-01-2026).
  // Resolvemos `companyId` (sempre UUID) consultando companies por id OU prospeccao_id.
  // `isRealRma` passa a ser true SOMENTE após resolução; antes disso usamos
  // um placeholder neutro (sem dados fictícios de empresa).
  const isUuidRoute = !!id && UUID_RE.test(id);
  const isRealRma = !!companyId;

  // Carrega empresa + análise (mantém polling até existir resultado terminal)
  useEffect(() => {
    if (!id) return;
    let timer: number | undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        let cid = companyId;
        if (!cid) {
          let q = supabase
            .from("companies")
            .select("id, name, prospeccao_id, execution_year, current_period_month");
          q = isUuidRoute ? q.eq("id", id!) : q.eq("prospeccao_id", id!);
          const { data: c } = await q.maybeSingle();
          if (c && !cancelled) {
            cid = (c as any).id as string;
            setCompanyId(cid);
            setCompanyName((c as any).name);
            setRmaCode((c as any).prospeccao_id || id!.toUpperCase());
            // Para Prospeccao-DIP-MM-YYYY a competência vem do código (mais confiável
            // que companies.current_period_month, que reflete o "mês corrente"
            // global da empresa e pode divergir do Prospeccao selecionado).
            const officialCompetencia = parseDipCompetencia((c as any).prospeccao_id || id);
            let ano: number | null = officialCompetencia?.ano ?? null;
            let mes: number | null = officialCompetencia?.mes ?? null;
            if (officialCompetencia) {
              const officialRouteKey = `${id || (c as any).prospeccao_id}:${officialCompetencia.key}`;
              if (officialCompetenciaAppliedRef.current !== officialRouteKey) {
                officialCompetenciaAppliedRef.current = officialRouteKey;
                setCompetencia(officialCompetencia);
              }
            } else if ((c as any).execution_year && (c as any).current_period_month) {
              ano = (c as any).execution_year as number;
              mes = (c as any).current_period_month as number;
            }
            if (ano && mes) {
              const key = `${ano}-${String(mes).padStart(2, "0")}`;
              const label = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
              setRmaPeriod({ ano, mes });
              if (!officialCompetencia) setCompetencia((prev) => prev ?? { ano, mes: mes!, key, label });
            }
          }
        }
        if (cid) {
          const r = await getRmaAnalysis(cid);
          if (!cancelled) {
            setAnalysis(r);
            if (r && r.status === "concluido" && r.finished_at && r.finished_at !== lastFinishedRef.current) {
              lastFinishedRef.current = r.finished_at;
              lastUpdatedRef.current = (r as any).updated_at ?? r.finished_at;
              setRunToken(r.finished_at);
            } else if (r && (r as any).updated_at && (r as any).updated_at !== lastUpdatedRef.current) {
              // Reflete dados parciais durante runs em_analise (ou qualquer mudança de updated_at)
              // sem aguardar finished_at — evita aba "vazia" enquanto a IA grava resultados incrementais.
              lastUpdatedRef.current = (r as any).updated_at;
              setRunToken(`upd:${(r as any).updated_at}`);
            }
          }
          const delay = !r || r.status === "em_analise" ? 1500 : 5000;
          if (!cancelled) timer = window.setTimeout(tick, delay);
        } else if (!cancelled) {
          timer = window.setTimeout(tick, 5000);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) timer = window.setTimeout(tick, 3000);
      }
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id, isUuidRoute, companyId]);

  useEffect(() => {
    if (!companyId) { setScoreFiles([]); setUnifiedScore(null); return; }
    let cancelled = false;
    const loadFiles = async () => {
      let q = supabase
        .from("onedrive_files")
        .select("company_id, path, file_name, status, last_processed_at, ano, mes")
        .eq("company_id", companyId)
        .neq("status", "inactive");
      if (competencia) {
        q = q.eq("ano", competencia.ano).eq("mes", competencia.mes);
      }
      const { data } = await q.limit(5000);
      if (!cancelled) setScoreFiles((data as any) || []);
    };
    const loadUnified = async () => {
      const scores = await fetchRmaScores([companyId]);
      if (!cancelled && scores[companyId]) setUnifiedScore(scores[companyId].percentual);
    };
    loadFiles();
    loadUnified();
    const timer = window.setInterval(() => { loadFiles(); loadUnified(); }, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [companyId, runToken, competencia?.ano, competencia?.mes]);

  // Overview card: SEMPRE usa a competência oficial do Prospeccao (companies.execution_year/current_period_month),
  // independente do seletor de competência usado em outras abas. Evita exibir contagens de outro mês.
  useEffect(() => {
    if (!companyId || !prospeccaoPeriod) { setOverviewFiles([]); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("onedrive_files")
        .select("company_id, path, file_name, status, last_processed_at, ano, mes")
        .eq("company_id", companyId)
        .eq("ano", prospeccaoPeriod.ano)
        .eq("mes", prospeccaoPeriod.mes)
        .neq("status", "inactive")
        .limit(5000);
      if (!cancelled) setOverviewFiles((data as any) || []);
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [companyId, prospeccaoPeriod?.ano, prospeccaoPeriod?.mes, runToken]);

  const handleUpdateIA = useCallback(async () => {
    if (!companyId) {
      setActiveTab("processamento");
      return;
    }
    setLoading(true);
    try {
      await startProspeccaoAnalysis(companyId);
      setAnalysis(prev => prev ? { ...prev, status: "em_analise" } : {
        id: companyId,
        company_id: companyId,
        status: "em_analise",
        percentual: 0,
        topics: [],
        diagnostico: null,
        indicadores: null,
        kanitz: null,
        score_rj: null,
        pendencias: null,
        alertas: null,
        balanco: null,
        dre: null,
        log: ["Análise IA iniciada"],
        error_message: null,
        started_at: new Date().toISOString(),
        finished_at: null,
        updated_at: new Date().toISOString(),
      });
      setTimeout(async () => {
        const r = await getRmaAnalysis(companyId);
        setAnalysis(r);
      }, 4000);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const liveWorkspaceTopics = buildLiveScoreTopics(analysis?.topics as any, scoreFiles);
  const localWorkspacePct = computeRmaScore(liveWorkspaceTopics, analysis?.percentual ?? 0);
  // unifiedScore (edge `prospeccao-score`) é a fonte canônica; reconcileScore garante
  // paridade com Status Prospeccao, Processamento IA e Alertas Inteligentes.
  const liveWorkspacePercentual = reconcileScore("ProspeccaoWorkspace", unifiedScore, localWorkspacePct);
  useScoreParityGuard(id ?? null, "ProspeccaoWorkspace", liveWorkspacePercentual);

  // Constrói ProspeccaoEntry a partir da análise real (para alimentar abas existentes)
  const realRma: ProspeccaoEntry = {
    id: prospeccaoCode || id || "",
    empresa: companyName || "—",
    status: analysis?.status === "concluido" ? "em_processamento" : "em_processamento",
    percentual: liveWorkspacePercentual,
    dataCriacao: analysis?.started_at || new Date().toISOString(),
    dataAtualizacao: analysis?.updated_at || new Date().toISOString(),
    responsavel: "—",
    coordenador: "—",
    topics: liveWorkspaceTopics.map((t, idx) => ({
      id: `t${t.number ?? idx + 1}`,
      pasta: Number(t.number ?? idx + 1),
      folder: `Pasta_${String(t.number ?? idx + 1).padStart(2, "0")}`,
      name: t.name,
      status: t.status === "completo" ? "completo" : analysis?.status === "em_analise" ? "em_processamento" : "pendente",
      completude: t.completude ?? 0,
      fileCount: t.fileCount ?? 0,
      docsParsed: t.docsParsed ?? 0,
      documents: [],
    })) as any,
  };

  // Placeholder neutro enquanto a empresa real não foi resolvida — sem dados
  // fictícios. Quando `isRealRma` ficar true, `realRma` substitui imediatamente.
  const routePlaceholder: ProspeccaoEntry = {
    id: id || "—",
    empresa: "Carregando…",
    status: "em_processamento",
    percentual: 0,
    dataCriacao: new Date().toISOString(),
    dataAtualizacao: new Date().toISOString(),
    responsavel: "—",
    coordenador: "—",
    topics: [],
  };
  const prospeccao = isRealRma ? realRma : routePlaceholder;
  const isStaleAnalyzing = analysis?.status === "em_analise" && !isRecentAnalysisRun(analysis?.updated_at);
  const isAnalyzing = loading || (analysis?.status === "em_analise" && !isStaleAnalyzing);
  const activeIndex = visibleTabs.findIndex(t => t.value === activeTab);

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">{prospeccao.id} — {prospeccao.empresa}</h1>
            <p className="text-sm text-muted-foreground">
              {isRealRma
                ? (isAnalyzing
                    ? "IA em execução — lendo OneDrive e auditando documentos…"
                    : isStaleAnalyzing
                      ? "Último processamento pausado — dados carregados pela competência oficial do Prospeccao"
                      : (analysis?.status === "erro" ? `Erro: ${analysis.error_message}` : "Análise IA concluída"))
                : `Responsável: ${prospeccao.responsavel} · Coordenador: ${prospeccao.coordenador}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isRealRma && (
              <>
                <CompetenciaSelector
                  companyId={companyId}
                  value={competencia}
                  onChange={setCompetencia}
                  refreshKey={runToken}
                  preferredCompetencia={prospeccaoPeriod ? {
                    ano: prospeccaoPeriod.ano,
                    mes: prospeccaoPeriod.mes,
                    key: `${prospeccaoPeriod.ano}-${String(prospeccaoPeriod.mes).padStart(2, "0")}`,
                    label: new Date(prospeccaoPeriod.ano, prospeccaoPeriod.mes - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
                  } : null}
                />
                <WindowSelector value={janela} onChange={handleJanelaChange} />
              </>
            )}
            {isRealRma && (
              <Badge
                className="text-[11px] font-semibold bg-[hsl(217,91%,50%)] text-white border-0 gap-1"
                title={`Janela de consolidação ativa: ${janelaLabel(janela)}`}
              >
                <span className="opacity-80">Janela</span>
                <span>{janela === 1 ? "1M" : `${janela}M`}</span>
              </Badge>
            )}
            {isAnalyzing && (
              <Badge className="text-xs bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-0 animate-pulse">
                Em Análise
              </Badge>
            )}
            <Badge className="text-xs bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)] border-0">
              {prospeccao.percentual}% completo
            </Badge>
          </div>
        </div>

        {/* ───── Visão Executiva (novo redesign UX/UI) ───── */}
        {(() => {
          const total = liveWorkspaceTopics.length || 0;
          const completos = liveWorkspaceTopics.filter(t => t.status === "completo").length;
          const incompletos = liveWorkspaceTopics.filter(t => (t.completude ?? 0) > 0 && t.status !== "completo").length;
          const pendentes = total - completos - incompletos;
          const criticas = liveWorkspaceTopics.filter(t => (t.completude ?? 0) === 0 && (t.fileCount ?? 0) === 0).length;
          const inconsistencias = liveWorkspaceTopics.filter(t => (t.completude ?? 0) > 0 && (t.completude ?? 0) < 50).length;
          const faltantes = pendentes;
          const docsParsedTotal = liveWorkspaceTopics.reduce((a, t) => a + (t.docsParsed ?? 0), 0);
          const filesTotal = liveWorkspaceTopics.reduce((a, t) => a + (t.fileCount ?? 0), 0);
          const docsPct = filesTotal > 0 ? Math.round((docsParsedTotal / filesTotal) * 100) : 0;
          const dadosPct = liveWorkspacePercentual;
          const validacoesPct = liveWorkspacePercentual;

          const journeySteps: JourneyStep[] = [
            { id: 1, label: "Dados & Upload", status: filesTotal > 0 ? "concluido" : "pendente", hint: filesTotal > 0 ? "Concluído" : "Aguardando upload", percent: filesTotal > 0 ? 100 : 0 },
            { id: 2, label: "Processamento IA", status: isAnalyzing ? "em_andamento" : (completos > 0 ? "em_andamento" : "pendente"), hint: isAnalyzing ? "Em andamento" : `${completos} de ${total}`, percent: dadosPct },
            { id: 3, label: "Auditoria", status: completos > 0 ? "em_andamento" : "pendente", hint: completos > 0 ? "Indicadores prontos" : "Aguardando processamento", percent: dadosPct },
            { id: 4, label: "Revisão Inteligente", status: incompletos + pendentes > 0 ? "pendente" : "concluido", hint: `${incompletos + pendentes} pendências`, percent: 100 - dadosPct },
            { id: 5, label: "Fechamento & Assinatura", status: dadosPct === 100 ? "em_andamento" : "bloqueado", hint: dadosPct === 100 ? "Pronto para fechar" : "Pendente" },
            { id: 6, label: "Relatório Prospeccao AJ", status: dadosPct >= 80 ? "em_andamento" : "bloqueado", hint: dadosPct >= 80 ? "Pronto para gerar" : "Aguardando dados" },
            
          ];

          const stepToTab: Record<number, string> = { 1: "processamento", 2: "processamento", 3: "dashboards", 4: "analise", 5: "relatorio-final" };
          const stepMap: Record<string, number> = {
            status: 2, processamento: 2, balancete: 2, "analise-tecnica": 4, bs: 3, pnl: 3,
            analise: 4, dashboards: 3, relatorio: 5, evolucao: 5, snapshot: 2, "relatorio-final": 5,
          };
          // O destaque do stepper segue o stage realmente renderizado.
          // Stage 0 = visão executiva (sem step destacado).
          const activeStep = activeStage === 0 ? 0 : activeStage;

          const topicItems: TopicItem[] = liveWorkspaceTopics.map((t, idx): TopicItem => {
            const c = t.completude ?? 0;
            const status: TopicStatus = c >= 100 ? "completo" : c > 0 ? "incompleto" : (analysis?.status === "em_analise" ? "em_processamento" : "pendente");
            const severity: TopicSeverity = c === 0 ? "critico" : c < 50 ? "alto" : c < 80 ? "medio" : "baixo";
            const impact = (severity === "critico" || severity === "alto") ? "Alto" : severity === "medio" ? "Médio" : "Baixo";
            return {
              id: t.id || `t${idx + 1}`,
              number: Number(t.number ?? idx + 1),
              title: t.name || `Tópico ${idx + 1}`,
              subtitle: status === "incompleto" ? "Documentos analisados parcialmente" : status === "pendente" ? "Aguardando processamento" : "Validação concluída com sucesso",
              severity,
              status,
              origin: "Sistema",
              impact: impact as "Alto" | "Médio" | "Baixo",
            };
          });

          const filteredTopics = [...topicItems]
            .sort((a, b) => {
              const order = { critico: 0, alto: 1, medio: 2, baixo: 3 } as const;
              return order[a.severity] - order[b.severity];
            })
            .slice(0, 8);

          const events = (analysis?.log || []).slice(-5).reverse().map((line: any, i: number) => {
            const time = new Date(analysis?.updated_at || Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            return { time, label: String(line).slice(0, 60), color: i === 0 ? "hsl(258,90%,56%)" : "hsl(217,91%,50%)" };
          });

          return (
            <>
              <JourneyStepper
                steps={journeySteps}
                active={activeStep}
                onStepClick={(s) => setActiveStage(s as 1 | 2 | 3 | 4 | 5 | 6)}
              />

              {activeStage === 0 && (
                <>
                  {(() => {
                    // Contagem canônica: alinhada ao "pipeline floor" usado por
                    // prospeccao-analyze (diagnostico.pipeline). "Processado" = OneDrive
                    // status === "processed" (ignora manual_upload_required, tracked
                    // e manual_uploaded — esses ainda não foram lidos pela IA).
                    const filesTotalOD = overviewFiles.length;
                    const filesProcessedOD = overviewFiles.filter(
                      (f: any) => f.status === "processed",
                    ).length;
                    return (
                      <WorkspaceOverviewDashboard
                        filesTotal={filesTotalOD}
                        filesProcessed={filesProcessedOD}
                        scorePct={liveWorkspacePercentual}
                        topicsCompletos={completos}
                        topicsIncompletos={incompletos}
                        topicsPendentes={pendentes}
                        topicsTotal={total}
                        pendenciasCount={incompletos + pendentes}
                        onResolve={() => setActiveStage(4)}
                      />
                    );
                  })()}

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <ScoreRingCard score={liveWorkspacePercentual} trend={liveWorkspacePercentual < 50 ? "down" : "up"} />
                    <ProcessingProgressCard processados={completos} pendentes={pendentes} incompletos={incompletos} total={total} />
                    <PendenciasResumoCard
                      criticas={criticas}
                      inconsistencias={inconsistencias}
                      faltantes={faltantes}
                      onResolve={() => setActiveStage(4)}
                    />
                    <SaudeRelatorioCard
                      documentos={docsPct}
                      dadosExtraidos={dadosPct}
                      validacoesIA={validacoesPct}
                      conformidade={dadosPct === 100 ? validacoesPct : null}
                    />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3">
                    <div className="bg-white border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h2 className="text-base font-bold text-foreground">Tópicos do Prospeccao AJ</h2>
                          <p className="text-xs text-muted-foreground">Priorize as pendências que mais impactam seu relatório.</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{filteredTopics.length} de {topicItems.length}</span>
                      </div>
                      <TopicsTaskList items={filteredTopics} onOpen={() => setActiveStage(4)} />
                    </div>
                    <div className="space-y-3">
                      <IAActivityTimeline events={events} />
                      <IATipCard
                        message={`Resolver os ${criticas} tópicos críticos pode aumentar seu score em até ${Math.min(18, criticas * 3)} pontos.`}
                        onCta={() => setActiveStage(4)}
                      />
                    </div>
                  </div>
                </>
              )}

              {activeStage === 1 && (
                <StageDadosUpload prospeccao={prospeccao} companyId={companyId} scoreFiles={scoreFiles} ano={competencia?.ano ?? null} mes={competencia?.mes ?? null} />
              )}

              {activeStage === 2 && (
                <StageProcessamentoIA
                  score={liveWorkspacePercentual}
                  completos={completos}
                  pendentes={pendentes}
                  incompletos={incompletos}
                  total={total}
                  criticas={criticas}
                  inconsistencias={inconsistencias}
                  faltantes={faltantes}
                  docsPct={docsPct}
                  dadosPct={dadosPct}
                  validacoesPct={validacoesPct}
                  events={events}
                  isAnalyzing={isAnalyzing}
                  companyId={companyId}
                  competencia={competencia}
                  runToken={runToken}
                  janela={janelaRange}
                  bsParsed={bsParsed}
                  bsEntries={bsEntries}
                  prospeccaoId={id || ""}
                />
              )}

              {activeStage === 3 && (
                <AuditoriaCard
                  companyId={companyId}
                  runToken={runToken}
                  bsParsed={bsParsed}
                  bsEntries={bsEntries}
                  prospeccaoId={id}
                  loading={bsLoading}
                />
              )}

              {activeStage === 4 && (
                <StageRevisaoInteligente topics={topicItems} criticas={criticas} prospeccaoId={prospeccaoCode} />
              )}

              {activeStage === 5 && (
                <StageFechamento
                  scoreFinal={liveWorkspacePercentual}
                  conformidade={validacoesPct}
                  pendencias={incompletos + pendentes}
                  documentosTotal={total}
                  documentosValidados={completos}
                  responsavel={prospeccao.responsavel}
                />
              )}

              {activeStage === 6 && (
                <StageRelatorioProspeccao
                  prospeccaoId={id || ""}
                  scoreFinal={liveWorkspacePercentual}
                  companyId={companyId}
                  prospeccaoCode={prospeccaoCode || prospeccao.id}
                  empresa={companyName || prospeccao.empresa}
                  mesReferencia={typeof competencia === "string" ? competencia : undefined}
                  responsavel={prospeccao.responsavel}
                />
              )}

            </>
          );
        })()}
      </div>
    </PlatformLayout>
  );
};

export default ProspeccaoWorkspace;

