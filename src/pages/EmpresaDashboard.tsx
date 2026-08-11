import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { BarChart3, FileText, Clock, CheckCircle2, AlertTriangle, Activity, TrendingUp, PlayCircle, Building2, ChevronDown, ChevronUp, Sparkles, History, Search, RefreshCw, AlertCircle, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import PlatformLayout from "@/components/PlatformLayout";
import { mockProspeccoes, type ProspeccaoEntry } from "@/data/prospeccoesMockData";
import { listMyAssignedCompanies, activateAssignedRma, type Company } from "@/services/companiesService";
import { startRmaAnalysis, listRmaAnalyses, type RmaAnalysisResult } from "@/services/prospeccaoAnalysisService";
import { listPeriodsForCompanies, type RmaPeriodAnalysis } from "@/services/prospecçãoPeriodService";
import RmaHistoricoTab from "@/components/RmaHistoricoTab";
import MyReleasesTab from "@/components/MyReleasesTab";
import Prospeccao360Panel from "@/components/coordenador/Prospeccao360Panel";
import { DeferredBatchIndicator } from "@/components/prospecção/DeferredBatchIndicator";
import RmaCompanySearch from "@/components/prospecção/RmaCompanySearch";
import { buildLiveScoreTopics, computeRmaScore, groupFilesByCompany, fetchRmaScores, type ScoreFile } from "@/lib/prospecçãoScore";

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  em_processamento: { label: "Em Processamento", color: "text-accent", bg: "bg-accent/15" },
  em_revisao: { label: "Em Revisão", color: "text-destructive", bg: "bg-destructive/15" },
  concluido: { label: "Concluído", color: "text-primary", bg: "bg-primary/15" },
  pendente: { label: "Pendente", color: "text-muted-foreground", bg: "bg-muted/30" },
};

const EmpresaDashboard = () => {
  const navigate = useNavigate();
  const { userName } = useUser();
  const { toast } = useToast();
  const firstName = userName?.split(" ")[0] || null;
  const [prospecçãos] = useState<ProspeccaoEntry[]>([]);

  // Prospeccaos atribuídos pelo Coordenador, aguardando ativação
  const [pendingCompanies, setPendingCompanies] = useState<Company[]>([]);
  const [activatedCompanies, setActivatedCompanies] = useState<Company[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, RmaAnalysisResult>>({});
  const [pendingOpen, setPendingOpen] = useState(true);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [statusCompanyId, setStatusCompanyId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [scoreFiles, setScoreFiles] = useState<ScoreFile[]>([]);
  const [unifiedScores, setUnifiedScores] = useState<Record<string, { percentual: number }>>({});

  // Histórico mensal
  const [periods, setPeriods] = useState<RmaPeriodAnalysis[]>([]);
  const [histYear, setHistYear] = useState<string>("todos");
  const [histMonth, setHistMonth] = useState<string>("todos");
  const [histCompany, setHistCompany] = useState<string>("todos");
  const [histSearch, setHistSearch] = useState("");

  const reloadAssigned = async () => {
    const list = await listMyAssignedCompanies();
    setPendingCompanies(list.filter(c => c.status === "pendente_ativacao"));
    setActivatedCompanies(list.filter(c => c.status !== "pendente_ativacao"));

    const companyIds = list.map(c => c.id);
    if (companyIds.length === 0) {
      setAnalyses({});
      return;
    }

    const rows = await listRmaAnalyses(companyIds);
    const next = rows.reduce<Record<string, RmaAnalysisResult>>((acc, row) => {
      acc[row.company_id] = row;
      return acc;
    }, {});
    setAnalyses(next);

    // Carrega histórico mensal das empresas atribuídas
    try {
      const periodRows = await listPeriodsForCompanies(companyIds);
      setPeriods(periodRows);
    } catch {
      /* silencia – aba histórico fica vazia */
    }
  };

  useEffect(() => {
    reloadAssigned().catch(() => {});
  }, []);

  // Polling peprospecçãonente: sempre que houver Prospeccao ativo, reconsulta a cada 2.5s
  // garantindo UI viva em Alertas Inteligentes + lista de Prospeccaos.
  useEffect(() => {
    if (activatedCompanies.length === 0 && pendingCompanies.length === 0) return;
    const hasRunning = Object.values(analyses).some(a => a.status === "em_analise");
    const interval = hasRunning ? 2000 : 5000;
    const timer = window.setInterval(() => {
      reloadAssigned().catch(() => {});
    }, interval);
    return () => window.clearInterval(timer);
  }, [activatedCompanies.length, pendingCompanies.length, analyses]);

  useEffect(() => {
    const companyIds = activatedCompanies.map((c) => c.id);
    if (companyIds.length === 0) { setScoreFiles([]); setUnifiedScores({}); return; }

    let cancelled = false;
    const loadFiles = async () => {
      const { data } = await supabase
        .from("onedrive_files")
        .select("company_id, path, file_name, status")
        .in("company_id", companyIds)
        .limit(5000);
      if (!cancelled) setScoreFiles((data as any) || []);
    };
    const loadUnified = async () => {
      const scores = await fetchRmaScores(companyIds);
      if (!cancelled && Object.keys(scores).length > 0) setUnifiedScores(scores as any);
    };

    loadFiles();
    loadUnified();
    const timer = window.setInterval(() => { loadFiles(); loadUnified(); }, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activatedCompanies]);

  const handleActivate = async (company: Company) => {
    setActivatingId(company.id);
    try {
      await activateAssignedRma(company.id);
      await startRmaAnalysis(company.id);
      await reloadAssigned();
      toast({
        title: "Análise IA iniciada",
        description: `${company.name}: lendo pastas e documentos no OneDrive.`,
      });
      navigate(`/prospecção/${company.id}`);
    } catch (e: any) {
      toast({ title: "Erro ao ativar Prospeccao AJ", description: e.message, variant: "destructive" });
    } finally {
      setActivatingId(null);
    }
  };

  /** Reinicia a análise IA do Prospeccao, zerando o prazo de 24h da flag. */
  const handleRefreshIA = async (companyId: string, companyName: string) => {
    setRefreshingId(companyId);
    try {
      await startRmaAnalysis(companyId);
      await reloadAssigned();
      toast({
        title: "Status IA atualizado",
        description: `${companyName}: análise reiniciada — prazo de 24h reiniciado.`,
      });
    } catch (e: any) {
      toast({ title: "Erro ao atualizar status IA", description: e.message, variant: "destructive" });
    } finally {
      setRefreshingId(null);
    }
  };

  // Combina Prospeccaos ativados (reais) + mocks para exibir nas abas Alertas e Prospeccaos
  const filesByCompany = useMemo(() => groupFilesByCompany(scoreFiles), [scoreFiles]);

  const realRmas = useMemo(() => activatedCompanies.map(c => {
    const analysis = analyses[c.id];
    const analysisTopics = analysis?.topics?.map((t, index) => ({
      id: `t${t.number ?? index + 1}`,
      number: t.number ?? index + 1,
      name: t.name,
      status: t.status,
      completude: t.completude ?? 0,
      fileCount: t.fileCount ?? 0,
      docsParsed: t.docsParsed ?? 0,
      processing: t.processing,
    })) || [];
    const topics = buildLiveScoreTopics(analysisTopics, filesByCompany[c.id]);
    const percentual = unifiedScores[c.id]?.percentual ?? computeRmaScore(topics, analysis?.percentual ?? 0);

    const mappedStatus = analysis?.status === "concluido"
      ? "concluido"
      : analysis?.status === "erro"
        ? "em_revisao"
        : "em_processamento";

    return {
      id: c.prospecção_id || c.id.slice(0, 8).toUpperCase(),
      companyId: c.id,
      empresa: c.name,
      status: mappedStatus,
      percentual,
      dataCriacao: c.created_at,
      dataAtualizacao: analysis?.updated_at || c.updated_at,
      responsavel: c.contact_name || "—",
      coordenador: "—",
      topics,
      analysisStatus: analysis?.status,
      mes: c.current_period_month && c.execution_year
        ? `${String(c.current_period_month).padStart(2, "0")}.${c.execution_year}`
        : null,
    };
  }), [activatedCompanies, analyses, filesByCompany]);
  const displayRmas: (ProspeccaoEntry & { companyId?: string; analysisStatus?: string })[] = [...realRmas as any, ...prospecçãos];

  const total = displayRmas.length;
  const emProcessamento = displayRmas.filter(r => r.status === "em_processamento").length;
  const emRevisao = displayRmas.filter(r => r.status === "em_revisao").length;
  const concluidos = displayRmas.filter(r => r.status === "concluido").length;

  const kpis = [
    { label: "Prospecções AJ em Andamento", value: emProcessamento, icon: Clock, color: "hsl(var(--accent))" },
    { label: "Em Análise IA", value: emProcessamento, icon: Activity, color: "hsl(var(--ring))" },
    { label: "Em Revisão", value: emRevisao, icon: AlertTriangle, color: "hsl(var(--destructive))" },
    { label: "Concluídos", value: concluidos, icon: CheckCircle2, color: "hsl(var(--primary))" },
  ];

  // Mapa de companyId → nome (usado na aba Histórico)
  const companyNameById = useMemo(() => {
    const m: Record<string, string> = {};
    [...activatedCompanies, ...pendingCompanies].forEach(c => {
      m[c.id] = c.name;
    });
    return m;
  }, [activatedCompanies, pendingCompanies]);

  const histYears = useMemo(() => {
    const set = new Set(periods.map(p => p.year));
    return Array.from(set).sort((a, b) => b - a);
  }, [periods]);

  const filteredPeriods = useMemo(() => {
    const q = histSearch.trim().toLowerCase();
    return periods.filter(p => {
      if (histYear !== "todos" && String(p.year) !== histYear) return false;
      if (histMonth !== "todos" && String(p.month) !== histMonth) return false;
      if (histCompany !== "todos" && p.company_id !== histCompany) return false;
      if (q) {
        const name = (companyNameById[p.company_id] || "").toLowerCase();
        if (!name.includes(q) && !p.period_label.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [periods, histYear, histMonth, histCompany, histSearch, companyNameById]);

  const monthLabels: Record<number, string> = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio", 6: "Junho",
    7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
  };

  // ---------- Atividades Recentes (dados reais) ----------
  const formatRelative = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso).getTime();
    if (!d || isNaN(d)) return "";
    const diff = Date.now() - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `Há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Há ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `Há ${days} dia${days > 1 ? "s" : ""}`;
    return new Date(iso).toLocaleDateString("pt-BR");
  };

  const recentActivities = useMemo(() => {
    const items: { id: string; text: string; time: string; ts: number }[] = [];
    activatedCompanies.forEach(c => {
      const a = analyses[c.id];
      const prospecçãoLabel = c.prospecção_id || c.name;
      if (a) {
        const ts = new Date(a.updated_at || a.started_at || c.updated_at).getTime();
        let text = "";
        if (a.status === "concluido") {
          text = `${prospecçãoLabel} — Análise IA concluída (${Math.round(a.percentual ?? 0)}%)`;
        } else if (a.status === "em_analise") {
          text = `${prospecçãoLabel} — Análise IA em andamento (${Math.round(a.percentual ?? 0)}%)`;
        } else if (a.status === "erro") {
          text = `${prospecçãoLabel} — Análise IA com erro — revisar`;
        } else {
          text = `${prospecçãoLabel} — ${a.status}`;
        }
        items.push({ id: `a-${c.id}`, text, time: formatRelative(a.updated_at || a.started_at), ts });
      } else {
        const ts = new Date(c.updated_at || c.created_at).getTime();
        items.push({
          id: `c-${c.id}`,
          text: `${prospecçãoLabel} — Prospeccao ativado para ${c.name}`,
          time: formatRelative(c.updated_at || c.created_at),
          ts,
        });
      }
    });
    pendingCompanies.forEach(c => {
      const ts = new Date(c.updated_at || c.created_at).getTime();
      items.push({
        id: `p-${c.id}`,
        text: `${c.prospecção_id || c.name} — Atribuído pelo Coordenador, aguardando ativação`,
        time: formatRelative(c.updated_at || c.created_at),
        ts,
      });
    });
    periods.slice(0, 20).forEach(p => {
      const ts = new Date(p.updated_at || p.created_at || 0).getTime();
      if (!ts) return;
      items.push({
        id: `pe-${p.id}`,
        text: `${companyNameById[p.company_id] || "Prospeccao"} — Período ${String(p.month).padStart(2, "0")}/${p.year} atualizado (${Math.round(p.percentual ?? 0)}%)`,
        time: formatRelative(p.updated_at || p.created_at),
        ts,
      });
    });
    return items.sort((a, b) => b.ts - a.ts).slice(0, 6);
  }, [activatedCompanies, pendingCompanies, analyses, periods, companyNameById]);

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Olá, {firstName || "Empresa"}</h1>
            <p className="text-sm text-muted-foreground">Gestão de Prospecções AJ e acompanhamento de processos</p>
          </div>
          <RmaCompanySearch
            companies={[...activatedCompanies, ...pendingCompanies]}
            onSelect={(c) => navigate(`/prospecção/${c.id}`)}
            placeholder="Buscar por empresa, ID Prospeccao AJ ou CNPJ..."
            className="w-full md:w-96"
          />
        </div>

        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="bg-muted/40 h-11 p-1">
            <TabsTrigger value="dashboard" className="gap-2 text-sm data-[state=active]:bg-accent data-[state=active]:text-white data-[state=active]:shadow-md">
              <BarChart3 className="w-4 h-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="prospecçãos" className="gap-2 text-sm data-[state=active]:bg-accent data-[state=active]:text-white data-[state=active]:shadow-md">
              <FileText className="w-4 h-4" /> Prospeccaos
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-2 text-sm data-[state=active]:bg-accent data-[state=active]:text-white data-[state=active]:shadow-md">
              <History className="w-4 h-4" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="liberacoes" className="gap-2 text-sm data-[state=active]:bg-accent data-[state=active]:text-white data-[state=active]:shadow-md">
              <Calendar className="w-4 h-4" /> Prospeccaos Liberados
            </TabsTrigger>
          </TabsList>

          {/* ABA 1 - Dashboard */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {kpis.map(kpi => (
                <Card key={kpi.label} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <kpi.icon className="w-5 h-5" style={{ color: kpi.color }} />
                    </div>
                    <p className="text-3xl font-bold text-foreground">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Prospeccaos Empresa atribuídos pelo Coordenador — aguardando ativação */}
            {pendingCompanies.length > 0 && (
              <Card className="border-2 border-accent/40 bg-gradient-to-br from-accent/5 to-transparent">
                <CardHeader className="pb-3">
                  <button
                    onClick={() => setPendingOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <CardTitle className="text-base flex items-center gap-2">
                          Prospeccaos Empresa atribuídos
                          <Badge className="bg-accent text-accent-foreground text-[10px]">
                            {pendingCompanies.length} aguardando
                          </Badge>
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Ative o Prospeccao para iniciar a análise da IA e carregar o status na plataforma
                        </p>
                      </div>
                    </div>
                    {pendingOpen ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                    )}
                  </button>
                </CardHeader>
                {pendingOpen && (
                  <CardContent className="space-y-3">
                    {pendingCompanies.map(company => (
                      <div
                        key={company.id}
                        className="p-4 rounded-lg bg-card border border-accent/20 flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-foreground truncate">{company.name}</p>
                              {company.prospecção_id && (
                                <Badge className="bg-accent text-accent-foreground text-[10px] font-mono">
                                  {company.prospecção_id}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                                Aguardando ativação
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {company.cnpj || "Sem CNPJ"}
                              {company.sector ? ` • ${company.sector}` : ""}
                              {company.city ? ` • ${company.city}${company.uf ? `/${company.uf}` : ""}` : ""}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleActivate(company)}
                          disabled={activatingId === company.id}
                          className="bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5 shrink-0"
                        >
                          <PlayCircle className="w-4 h-4" />
                          {activatingId === company.id ? "Ativando..." : "Ativar Prospeccao"}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Alertas — Prospeccaos com atualização nas últimas 24h */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" /> Alertas Inteligentes
                  <span className="text-[10px] font-noprospecçãol text-muted-foreground ml-1">
                    (atualizações dos Prospeccaos nas últimas 24h)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const now = Date.now();
                  const DAY_MS = 24 * 60 * 60 * 1000;
                  // Considera apenas Prospeccaos reais (com companyId) que NÃO estão concluídos
                  const candidatos = displayRmas.filter(r => r.status !== "concluido" && r.companyId);
                  if (candidatos.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground text-center py-6">
                        Nenhum Prospeccao atualizado no momento.
                      </p>
                    );
                  }
                  return candidatos.map(prospecção => {
                    const sc = statusConfig[prospecção.status];
                    const pct = prospecção.percentual;
                    const pendingCount = prospecção.topics.length > 0
                      ? prospecção.topics.filter(t => t.status !== "completo").length
                      : 0;
                    const targetId = prospecção.companyId || prospecção.id;
                    const company = activatedCompanies.find(c => c.id === targetId);
                    const isStatusOpen = statusCompanyId === targetId;
                    const updatedAt = prospecção.dataAtualizacao ? new Date(prospecção.dataAtualizacao).getTime() : 0;
                    const ageMs = updatedAt ? now - updatedAt : Number.POSITIVE_INFINITY;
                    const isStale = ageMs > DAY_MS;
                    const hoursAgo = updatedAt ? Math.floor(ageMs / (60 * 60 * 1000)) : null;
                    // "Em processamento" é derivado do servidor (status === 'em_analise')
                    // OU do estado local (clique recente). Assim, mesmo após logout/login
                    // o botão continua mostrando o spinner enquanto a run roda em background.
                    const serverRunning = analyses[targetId]?.status === "em_analise";
                    const isRefreshing = refreshingId === targetId || serverRunning;
                    return (
                      <div key={(prospecção as any).companyId || prospecção.id} className="p-4 rounded-lg bg-muted/30 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-foreground truncate">{prospecção.id} — {prospecção.empresa}</p>
                              {isStale && (
                                <Badge className="bg-destructive/15 text-destructive border-0 text-[10px] gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Sem Atualização Dados
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {prospecção.analysisStatus === "em_analise"
                                ? `${pendingCount} tópicos em processamento`
                                : `${pendingCount} tópicos pendentes`}
                              {hoursAgo !== null && (
                                <span className="ml-2">
                                  · Última atualização: {hoursAgo < 1 ? "agora há pouco" : `há ${hoursAgo}h`}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge className={`${sc.bg} ${sc.color} border-0`}>{sc.label}</Badge>
                            <span className="text-2xl font-bold text-foreground">{pct}%</span>
                          </div>
                        </div>
                        {/* Barra de evolução */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px] font-semibold uppercase tracking-wide">
                            <span className="text-[hsl(0,84%,60%)]">Crítico 0-33</span>
                            <span className="text-[hsl(38,92%,50%)]">Moderado 33-67</span>
                            <span className="text-[hsl(142,76%,36%)]">Excelente 67-100</span>
                          </div>
                          <div className="relative h-3 rounded-full overflow-hidden flex">
                            <div className="h-full bg-[hsl(0,84%,60%)]" style={{ width: "33%" }} />
                            <div className="h-full bg-[hsl(45,100%,60%)]" style={{ width: "34%" }} />
                            <div className="h-full bg-[hsl(142,76%,45%)]" style={{ width: "33%" }} />
                            {(() => {
                              const safePct = Math.max(0, Math.min(100, Number(pct) || 0));
                              const clampedLeft = Math.max(1, Math.min(99, safePct));
                              return (
                                <div
                                  className="absolute top-[-2px] h-[calc(100%+4px)] w-[4px] rounded-sm shadow-md ring-1 ring-white z-10 transition-all duration-500"
                                  style={{
                                    left: `${clampedLeft}%`,
                                    transform: "translateX(-50%)",
                                    backgroundColor: "hsl(222,47%,14%)",
                                  }}
                                  aria-label={`Evolução ${safePct}%`}
                                />
                              );
                            })()}
                          </div>
                          <div className="flex justify-end">
                            <span className="text-[10px] font-semibold text-muted-foreground">Resultado: <span className="text-foreground font-bold">{pct}/100</span></span>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 flex-wrap">
                          {company && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1.5"
                              onClick={() => handleRefreshIA(targetId, prospecção.empresa)}
                              disabled={isRefreshing}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                              {serverRunning
                                ? "Processando em background..."
                                : isRefreshing ? "Atualizando..." : "Atualizar Status IA"}
                            </Button>
                          )}
                          {company && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1.5"
                              onClick={() => setStatusCompanyId(isStatusOpen ? null : targetId)}
                            >
                              <Activity className="w-3.5 h-3.5" />
                              {isStatusOpen ? "Ocultar Status" : "Status Empresa"}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate(`/prospecção/${targetId}`)}>
                            Ver Prospeccao
                          </Button>
                        </div>
                        {/* Indicador de fila batch (arquivos grandes processados em horário off-peak) */}
                        {company && (
                          <DeferredBatchIndicator
                            companyId={targetId}
                            prospecçãoId={prospecção.id}
                            variant="prospecção-summary"
                          />
                        )}
                        {isStatusOpen && company && (
                          <div className="pt-2">
                            <Prospeccao360Panel company={company} onClose={() => setStatusCompanyId(null)} />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent" /> Atividades Recentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentActivities.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem atividades recentes registradas para os seus Prospecções AJ.</p>
                  ) : recentActivities.map((act) => (
                    <div key={act.id} className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{act.text}</p>
                        <p className="text-xs text-muted-foreground">{act.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 2 - Prospeccaos */}
          <TabsContent value="prospecçãos" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Lista de Prospecções AJ</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground">ID</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground">Empresa</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground">Mês</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground">Status</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground">% Completo</th>
                        <th className="text-left py-3 px-3 text-xs font-semibold text-muted-foreground">Atualização</th>
                        <th className="text-right py-3 px-3 text-xs font-semibold text-muted-foreground">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRmas.map(prospecção => {
                        const sc = statusConfig[prospecção.status];
                        return (
                          <tr key={(prospecção as any).companyId || prospecção.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-3 font-mono font-semibold text-foreground">{prospecção.id}</td>
                            <td className="py-3 px-3 text-foreground">{prospecção.empresa}</td>
                            <td className="py-3 px-3">
                              {(prospecção as any).mes ? (
                                <Badge className="bg-[hsl(258,90%,66%)]/15 text-[hsl(258,90%,56%)] font-mono text-[10px] border-0">
                                  {(prospecção as any).mes}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <Badge className={`${sc.bg} ${sc.color} border-0 text-xs`}>{sc.label}</Badge>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="relative h-2 w-20 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full transition-all bg-accent" style={{ width: `${prospecção.percentual}%` }} />
                                </div>
                                <span className="text-xs font-mono font-semibold text-foreground">{prospecção.percentual}%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-xs text-muted-foreground">{prospecção.dataAtualizacao}</td>
                            <td className="py-3 px-3 text-right">
                              <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate(`/prospecção/${prospecção.companyId || prospecção.id}`)}>
                                Ver Prospeccao
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA 3 - Histórico de Prospeccaos por período */}
          <TabsContent value="historico" className="space-y-4">
            <RmaHistoricoTab
              periods={periods}
              companies={[...activatedCompanies, ...pendingCompanies]}
            />
          </TabsContent>

          <TabsContent value="liberacoes" className="space-y-4">
            <MyReleasesTab scope="self" />
          </TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
};

export default EmpresaDashboard;
