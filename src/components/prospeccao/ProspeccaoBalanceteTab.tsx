import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity, CheckCircle2, AlertTriangle, RefreshCw, FileText,
  Search, ListChecks, GitMerge, ShieldCheck, Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabase-any";
import { toast } from "sonner";
import OrphanExtractionsCard from "./OrphanExtractionsCard";
import BalancetePreview from "./BalancetePreview";
import BalanceteVersoesCard from "./BalanceteVersoesCard";
import AutoAlertsCard from "./AutoAlertsCard";
import BalanceteValidacoesHistorico from "./BalanceteValidacoesHistorico";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBTABS = [
  { value: "preview", label: "Preview Balancete", icon: FileText },
  { value: "conflitos", label: "Conflitos Pendentes", icon: GitMerge },
  { value: "validacao", label: "Validação Contábil", icon: ListChecks },
  { value: "status", label: "Status do Run", icon: Activity },
  { value: "auditoria", label: "Auditoria & Lançamentos", icon: Search },
] as const;

type Conflict = {
  id: string;
  conta: string;
  descricao: string | null;
  ano: number;
  mes: number;
  status: string;
  valor_vencedor: number | null;
  confianca_vencedor: number | null;
  origem_vencedor: string | null;
  diferenca_max: number;
  valores: any;
  resolution_notes: string | null;
};

const fmtBRL = (v?: number | null) => {
  if (v == null || isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const months = [
  { v: 1, l: "Janeiro" }, { v: 2, l: "Fevereiro" }, { v: 3, l: "Março" },
  { v: 4, l: "Abril" }, { v: 5, l: "Maio" }, { v: 6, l: "Junho" },
  { v: 7, l: "Julho" }, { v: 8, l: "Agosto" }, { v: 9, l: "Setembro" },
  { v: 10, l: "Outubro" }, { v: 11, l: "Novembro" }, { v: 12, l: "Dezembro" },
];

type Run = {
  id: string;
  status: string;
  progress: number;
  ano: number; mes: number;
  files_total: number; files_processed: number; files_skipped: number;
  folders_total: number; folders_processed: number;
  lancamentos_criados: number;
  reconciliation_passed: boolean | null;
  reconciliation_report: any;
  alerts: any[];
  log: string[];
  cost_total: number;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

interface CompanyPeriod {
  prospeccao_id: string | null;
  current_period_month: number | null;
  execution_year: number | null;
  last_analyzed_period: string | null;
}

interface ProspeccaoBalanceteTabProps {
  initialSubtab?: typeof SUBTABS[number]["value"];
  /** Competência selecionada no header global (sobrepõe o período do cadastro). */
  periodo?: { ano: number; mes: number } | null;
}

const ProspeccaoBalanceteTab = ({ initialSubtab, periodo }: ProspeccaoBalanceteTabProps = {}) => {
  const { id } = useParams<{ id: string }>();
  const isRealRma = !!id && UUID_RE.test(id);

  const [subtab, setSubtab] = useState<typeof SUBTABS[number]["value"]>(initialSubtab || "preview");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(1);
  const [companyPeriod, setCompanyPeriod] = useState<CompanyPeriod | null>(null);

  // Carrega período fixo do Prospeccao (definido na criação do cadastro)
  useEffect(() => {
    if (!isRealRma || !id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled || !data) return;
      setCompanyPeriod(data as any);
      // Aplica o período do cadastro do Prospeccao
      let mes = (data as any).current_period_month ?? null;
      let ano = (data as any).execution_year ?? null;
      // Fallback: tenta last_analyzed_period (formato MM-YYYY)
      if ((!mes || !ano) && (data as any).last_analyzed_period) {
        const m = String((data as any).last_analyzed_period).match(/^(\d{1,2})-(\d{4})$/);
        if (m) { mes = Number(m[1]); ano = Number(m[2]); }
      }
      if (mes && ano) { setMonth(mes); setYear(ano); }
    })();
    return () => { cancelled = true; };
  }, [id, isRealRma]);

  // Sincroniza com a competência global (header) sempre que o usuário trocar o mês.
  useEffect(() => {
    if (periodo?.ano && periodo?.mes) {
      setYear(periodo.ano);
      setMonth(periodo.mes);
    }
  }, [periodo?.ano, periodo?.mes]);
  const running = false;
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [consolidado, setConsolidado] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [auditByConflict, setAuditByConflict] = useState<Record<string, any[]>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [crossLoading, setCrossLoading] = useState(false);
  const [crossResult, setCrossResult] = useState<any | null>(null);
  const [crossPersist, setCrossPersist] = useState(true);
  const [crossHistory, setCrossHistory] = useState<any[]>([]);

  const loadCrossHistory = useCallback(async () => {
    if (!isRealRma || !id) return;
    const { data } = await (supabase
      .from("cross_validation_runs") as any)
      .select("id, ano, mes, score, passed, checked, issues, persisted_versions, created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    setCrossHistory((data as any) || []);
  }, [id, isRealRma]);

  useEffect(() => { loadCrossHistory(); }, [loadCrossHistory]);

  // Sincroniza quando initialSubtab muda (ao trocar de aba do dashboard)
  useEffect(() => {
    if (initialSubtab) setSubtab(initialSubtab);
  }, [initialSubtab]);

  // ---- carrega histórico do run mais recente para o período ----
  const loadHistory = useCallback(async () => {
    if (!isRealRma || !id) return;
    const { data } = await supabase
      .from("balancete_runs")
      .select("*")
      .eq("company_id", id)
      .order("started_at", { ascending: false })
      .limit(20);
    setHistory((data || []) as any);
    const latest = (data || []).find((r: any) => r.ano === year && r.mes === month);
    if (latest) setRun(latest as any);
  }, [id, isRealRma, year, month]);

  const loadConsolidado = useCallback(async () => {
    if (!isRealRma || !id) return;
    const { data } = await supabase
      .from("balancete_consolidado")
      .select("*")
      .eq("company_id", id)
      .eq("ano", year)
      .eq("mes", month)
      .order("conta", { ascending: true });
    setConsolidado(data || []);
  }, [id, isRealRma, year, month]);

  const loadLancamentos = useCallback(async () => {
    if (!isRealRma || !id) return;
    const { data } = await supabase
      .from("lancamentos")
      .select("*")
      .eq("company_id", id)
      .eq("ano", year)
      .eq("mes", month)
      .order("created_at", { ascending: false })
      .limit(500);
    setLancamentos(data || []);
  }, [id, isRealRma, year, month]);

  const loadConflicts = useCallback(async () => {
    if (!isRealRma || !id) return;
    const { data } = await supabase
      .from("balancete_conflicts")
      .select("*")
      .eq("company_id", id)
      .eq("ano", year)
      .eq("mes", month)
      .order("status", { ascending: true })
      .order("diferenca_max", { ascending: false });
    setConflicts((data || []) as any);
  }, [id, isRealRma, year, month]);

  const loadConflictAudit = useCallback(async (ids: string[]) => {
    if (!ids.length) { setAuditByConflict({}); return; }
    const { data, error } = await (supabase
      .from("balancete_conflict_audit") as any)
      .select("id, conflict_id, user_id, user_role, action, from_status, to_status, notes, created_at")
      .in("conflict_id", ids)
      .order("created_at", { ascending: false });
    if (error) { console.warn("[audit] load error", error); return; }
    const grouped: Record<string, any[]> = {};
    for (const r of (data || []) as any[]) {
      (grouped[r.conflict_id] ||= []).push(r);
    }
    setAuditByConflict(grouped);
  }, []);

  const resolveConflict = async (cid: string, action: "aceitar_vencedor" | "manual_review") => {
    setResolvingId(cid);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Você precisa estar autenticado.");
        return;
      }
      const { data, error } = await supabase
        .from("balancete_conflicts")
        .update({
          status: action === "aceitar_vencedor" ? "resolvido" : "em_validacao",
          resolution_action: action,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", cid)
        .select("id");
      if (error) {
        console.error("[resolveConflict] error", error);
        toast.error(error.message);
        return;
      }
      if (!data || data.length === 0) {
        toast.error("Sem permissão para resolver conflitos. Apenas Coordenador ou Gestor IA podem aprovar/devolver.");
        return;
      }
      toast.success(action === "aceitar_vencedor" ? "Vencedor aceito" : "Enviado para revisão manual");
      loadConflicts();
    } finally {
      setResolvingId(null);
    }
  };

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { loadConsolidado(); loadLancamentos(); loadConflicts(); }, [loadConsolidado, loadLancamentos, loadConflicts]);
  useEffect(() => { loadConflictAudit(conflicts.map(c => c.id)); }, [conflicts, loadConflictAudit]);

  // ---- polling enquanto roda ----
  useEffect(() => {
    if (!run || ["completed", "reconciled", "flagged", "error"].includes(run.status)) return;
    const t = setInterval(async () => {
      const { data: latest } = await supabase
        .from("balancete_runs").select("*").eq("id", run.id).maybeSingle();
      if (latest) setRun(latest as any);
      if (latest && ["completed", "reconciled", "flagged", "error"].includes((latest as any).status)) {
        loadConsolidado(); loadLancamentos(); loadHistory();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [run?.id, run?.status, loadConsolidado, loadLancamentos, loadHistory]);

  // Pipeline de balancete agora é disparado automaticamente por prospeccao-analyze
  // (ver botão "Atualizar Status IA" na aba Status Prospeccao).


  const reviewLancamento = async (lancId: string, novoStatus: "ok" | "manual_review" | "rejected") => {
    setReviewing(lancId);
    const { error } = await supabase
      .from("lancamentos")
      .update({ status: novoStatus, reviewed_at: new Date().toISOString() })
      .eq("id", lancId);
    setReviewing(null);
    if (error) toast.error(error.message);
    else { toast.success("Lançamento atualizado"); loadLancamentos(); }
  };

  // ---- métricas ----
  const totals = useMemo(() => {
    const ativo = consolidado.filter(c => c.tipo === "ativo").reduce((s, c) => s + Number(c.valor || 0), 0);
    const passivo = consolidado.filter(c => c.tipo === "passivo").reduce((s, c) => s + Number(c.valor || 0), 0);
    const pl = consolidado.filter(c => c.tipo === "patrimonio_liquido").reduce((s, c) => s + Number(c.valor || 0), 0);
    const receita = consolidado.filter(c => c.tipo === "receita").reduce((s, c) => s + Number(c.valor || 0), 0);
    const despesa = consolidado.filter(c => c.tipo === "despesa").reduce((s, c) => s + Number(c.valor || 0), 0);
    return { ativo, passivo, pl, receita, despesa, diff: ativo - (passivo + pl) };
  }, [consolidado]);

  const statusBadge = (s?: string) => {
    const map: Record<string, { bg: string; fg: string; label: string }> = {
      pending: { bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,40%)", label: "Aguardando" },
      processing: { bg: "hsl(38,92%,50%)/15", fg: "hsl(38,92%,50%)", label: "Processando" },
      completed: { bg: "hsl(217,91%,50%)/15", fg: "hsl(217,91%,50%)", label: "Concluído" },
      reconciled: { bg: "hsl(142,76%,36%)/15", fg: "hsl(142,76%,36%)", label: "Reconciliado ✓" },
      flagged: { bg: "hsl(38,92%,50%)/15", fg: "hsl(38,92%,50%)", label: "Divergente ⚠" },
      error: { bg: "hsl(0,84%,60%)/15", fg: "hsl(0,84%,60%)", label: "Erro" },
    };
    const m = map[s || "pending"] || map.pending;
    return <Badge className="border-0" style={{ background: m.bg, color: m.fg }}>{m.label}</Badge>;
  };

  if (!isRealRma) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Abra um Prospeccao real (criado no banco) para usar o pipeline de balancete.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <AutoAlertsCard companyId={id ?? null} />
      {/* Header de controle */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Pipeline de Balancete — IA</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Lê OneDrive → Vision OCR → IA → Mapeia plano de contas → Consolida → Reconcilia
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={String(year)} disabled>
                <SelectTrigger className="h-9 w-24 opacity-90 cursor-not-allowed" title="Período definido no cadastro do Prospeccao AJ">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(year)}>{year}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(month)} disabled>
                <SelectTrigger className="h-9 w-32 opacity-90 cursor-not-allowed" title="Período definido no cadastro do Prospeccao AJ">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(month)}>{months.find(m => m.v === month)?.l || month}</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="text-[10px] gap-1">
                🔒 Período do Prospeccao{companyPeriod?.prospeccao_id ? ` ${companyPeriod.prospeccao_id}` : ""}
              </Badge>
              <Button onClick={() => { loadHistory(); loadConsolidado(); loadLancamentos(); }} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Aviso de extrações órfãs (não consolidadas) */}
      {isRealRma && id && (
        <OrphanExtractionsCard
          companyId={id}
          prospeccaoId={companyPeriod?.prospeccao_id || null}
          onConsolidated={() => { loadHistory(); loadConsolidado(); loadLancamentos(); }}
        />
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-border/30 overflow-x-auto">
        {SUBTABS.map(t => {
          const Icon = t.icon;
          const active = subtab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setSubtab(t.value)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                active
                  ? "border-[hsl(217,91%,50%)] text-[hsl(217,91%,50%)]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ===== STATUS ===== */}
      {subtab === "status" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Run atual ({String(month).padStart(2, "0")}/{year})</CardTitle>
                {statusBadge(run?.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!run ? (
                <p className="text-sm text-muted-foreground">Nenhum run para este período. Clique em <b>Atualizar Status IA</b> na aba <b>Status Prospeccao AJ</b>.</p>
              ) : (
                <>
                  <Progress value={run.progress} className="h-2" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <Stat label="Pastas" v={`${run.folders_processed}/${run.folders_total}`} />
                    <Stat label="Arquivos" v={`${run.files_processed}/${run.files_total}`} />
                    <Stat label="Lançamentos" v={String(run.lancamentos_criados)} />
                    <Stat label="Custo IA" v={`$ ${Number(run.cost_total || 0).toFixed(4)}`} />
                  </div>
                  {run.error_message && (
                    <div className="text-xs p-2 rounded bg-destructive/10 text-destructive">{run.error_message}</div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {run && run.log && run.log.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Log de execução</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-1 font-mono text-[11px]">
                    {run.log.map((l: any, i) => {
                      const text = typeof l === "string"
                        ? l
                        : l && typeof l === "object"
                          ? `${l.t ? `[${l.t}] ` : ""}${l.msg ?? JSON.stringify(l)}`
                          : String(l);
                      return <div key={i} className="text-muted-foreground">{text}</div>;
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico de runs</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-xs">
                <thead><tr className="border-b text-muted-foreground">
                  <th className="text-left py-2">Período</th><th className="text-left">Status</th>
                  <th className="text-right">Arquivos</th><th className="text-right">Lançamentos</th>
                  <th className="text-right">Custo</th><th className="text-right">Início</th>
                </tr></thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-b border-border/20 hover:bg-muted/30 cursor-pointer"
                        onClick={() => { setYear(h.ano); setMonth(h.mes); setRun(h); }}>
                      <td className="py-1.5">{String(h.mes).padStart(2, "0")}/{h.ano}</td>
                      <td>{statusBadge(h.status)}</td>
                      <td className="text-right">{h.files_processed}/{h.files_total}</td>
                      <td className="text-right">{h.lancamentos_criados}</td>
                      <td className="text-right">$ {Number(h.cost_total || 0).toFixed(4)}</td>
                      <td className="text-right text-muted-foreground">{new Date(h.started_at).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">Sem runs ainda</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== CONFLITOS PENDENTES ===== */}
      {subtab === "conflitos" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Stat label="Total Conflitos" v={String(conflicts.length)} big />
            <Stat label="Pendentes" v={String(conflicts.filter(c => c.status === "pendente").length)} big
                  danger={conflicts.filter(c => c.status === "pendente").length > 0} />
            <Stat label="Em Validação" v={String(conflicts.filter(c => c.status === "em_validacao").length)} big />
            <Stat label="Resolvidos" v={String(conflicts.filter(c => c.status === "resolvido").length)} big />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-[hsl(38,92%,50%)]" />
                Análise Técnica — Conflitos por conta ({String(month).padStart(2, "0")}/{year})
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Quando 2+ documentos divergem para a mesma conta/período, o sistema mantém o valor de maior confiança como vencedor.
                Revise abaixo e confirme o vencedor ou marque para validação manual.
              </p>
            </CardHeader>
            <CardContent>
              {conflicts.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-[hsl(142,76%,36%)]" />
                  Nenhum conflito detectado neste período.
                </div>
              ) : (
                <div className="space-y-3">
                  {conflicts.map(c => {
                    const valores = Array.isArray(c.valores) ? c.valores : [];
                    const conf = Number(c.confianca_vencedor || 0);
                    const confColor = conf >= 0.7 ? "hsl(142,76%,36%)" : conf >= 0.5 ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)";
                    const statusBg: Record<string, string> = {
                      pendente: "hsl(38,92%,50%)/15",
                      em_validacao: "hsl(217,91%,50%)/15",
                      resolvido: "hsl(142,76%,36%)/15",
                    };
                    const statusFg: Record<string, string> = {
                      pendente: "hsl(38,92%,50%)",
                      em_validacao: "hsl(217,91%,50%)",
                      resolvido: "hsl(142,76%,36%)",
                    };
                    return (
                      <div key={c.id} className="border border-border/40 rounded-lg p-3 bg-card">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold">{c.conta}</span>
                              <span className="text-sm text-foreground">{c.descricao || "—"}</span>
                              <Badge className="border-0 text-[10px]"
                                     style={{ background: statusBg[c.status] || "hsl(220,15%,93%)", color: statusFg[c.status] || "hsl(220,15%,40%)" }}>
                                {c.status}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-1">
                              Diferença máxima: <b className="text-destructive">{fmtBRL(c.diferenca_max)}</b>
                              {" · "}Vencedor: <b style={{ color: confColor }}>{fmtBRL(c.valor_vencedor)}</b>
                              {" · "}Confiança: <b style={{ color: confColor }}>{(conf * 100).toFixed(0)}%</b>
                              {c.origem_vencedor && (<>{" · Origem: "}<span className="font-mono">{c.origem_vencedor}</span></>)}
                            </div>
                          </div>
                          {c.status === "pendente" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-[11px]"
                                      disabled={resolvingId === c.id}
                                      onClick={() => resolveConflict(c.id, "aceitar_vencedor")}>
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Aceitar vencedor
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                                      disabled={resolvingId === c.id}
                                      onClick={() => resolveConflict(c.id, "manual_review")}>
                                Revisão manual
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="border-b border-border/30 text-muted-foreground">
                                <th className="text-left py-1 px-2">Documento / Origem</th>
                                <th className="text-right px-2 w-32">Valor</th>
                                <th className="text-right px-2 w-24">Confiança</th>
                                <th className="text-center px-2 w-20">Vencedor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {valores.map((v: any, i: number) => {
                                const isWinner = Number(v.valor) === Number(c.valor_vencedor) &&
                                                 (v.origem === c.origem_vencedor || !c.origem_vencedor);
                                const vConf = Number(v.confianca || 0);
                                const vColor = vConf >= 0.7 ? "hsl(142,76%,36%)" : vConf >= 0.5 ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)";
                                return (
                                  <tr key={i} className={`border-b border-border/10 ${isWinner ? "bg-[hsl(142,76%,36%)]/5" : ""}`}>
                                    <td className="py-1 px-2 font-mono truncate max-w-[260px]" title={v.origem || v.document_id}>
                                      {v.origem || v.document_id || `doc-${i + 1}`}
                                    </td>
                                    <td className="px-2 text-right font-mono">{fmtBRL(Number(v.valor))}</td>
                                    <td className="px-2 text-right font-semibold" style={{ color: vColor }}>
                                      {(vConf * 100).toFixed(0)}%
                                    </td>
                                    <td className="px-2 text-center">
                                      {isWinner && <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(142,76%,36%)] inline" />}
                                    </td>
                                  </tr>
                                );
                              })}
                              {valores.length === 0 && (
                                <tr><td colSpan={4} className="text-center py-2 text-muted-foreground">Sem detalhamento de valores</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        {c.resolution_notes && (
                          <div className="mt-2 text-[11px] text-muted-foreground italic">📝 {c.resolution_notes}</div>
                        )}
                        {(auditByConflict[c.id]?.length ?? 0) > 0 && (
                          <div className="mt-2 border-t border-border/30 pt-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Trilha de auditoria ({auditByConflict[c.id].length})
                            </div>
                            <ul className="space-y-1">
                              {auditByConflict[c.id].map((a: any) => (
                                <li key={a.id} className="text-[11px] flex items-start gap-2">
                                  <span className="text-muted-foreground font-mono whitespace-nowrap">
                                    {new Date(a.created_at).toLocaleString("pt-BR")}
                                  </span>
                                  <Badge variant="outline" className="h-4 text-[9px] px-1">{a.user_role || "—"}</Badge>
                                  <span>
                                    <b>{a.action}</b>
                                    {a.from_status && a.to_status && (
                                      <span className="text-muted-foreground"> · {a.from_status} → {a.to_status}</span>
                                    )}
                                    {a.notes && <span className="text-muted-foreground italic"> · {a.notes}</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== VALIDAÇÃO CONTÁBIL ===== */}
      {subtab === "validacao" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat label="Ativo Total" v={fmtBRL(totals.ativo)} big />
            <Stat label="Passivo + PL" v={fmtBRL(totals.passivo + totals.pl)} big />
            <Stat
              label="Diferença"
              v={fmtBRL(totals.diff)}
              big
              danger={Math.abs(totals.diff) > Math.abs(totals.ativo) * 0.001}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {run?.reconciliation_passed
                  ? <CheckCircle2 className="w-4 h-4 text-[hsl(142,76%,36%)]" />
                  : <AlertTriangle className="w-4 h-4 text-[hsl(38,92%,50%)]" />}
                Reconciliação Ativo = Passivo + PL
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              {run?.reconciliation_report ? (
                <pre className="bg-muted/30 p-3 rounded overflow-auto text-[11px]">
                  {JSON.stringify(run.reconciliation_report, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">Execute o pipeline para gerar a reconciliação.</p>
              )}
              {run?.alerts && run.alerts.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold text-[hsl(38,92%,50%)]">Alertas:</div>
                  {run.alerts.map((a: any, i: number) => (
                    <div key={i} className="p-2 rounded bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)]">
                      {typeof a === "string" ? a : JSON.stringify(a)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Histórico de validações estruturadas persistidas */}
          <BalanceteValidacoesHistorico companyId={id ?? null} />

          {/* === Validador Cross-Doc 2.0 === */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                    Validador Cross-Doc 2.0
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Valida coerência entre múltiplos documentos: CNPJ, período, equação contábil,
                    caixa vs fluxo, duplicidades.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={crossPersist}
                      onChange={(e) => setCrossPersist(e.target.checked)}
                      className="accent-[hsl(217,91%,50%)]"
                    />
                    Persistir snapshots
                  </label>
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!id) return;
                      setCrossLoading(true);
                      try {
                        const { data, error } = await supabase.functions.invoke("cross-validate", {
                          body: { company_id: id, ano: year, mes: month, persist: crossPersist },
                        });
                        if (error) throw error;
                        setCrossResult(data);
                        toast.success(
                          `Validação concluída — score ${(Number(data?.score || 0) * 100).toFixed(0)}%${
                            data?.persisted_versions ? ` · ${data.persisted_versions} snapshots gravados` : ""
                          }`,
                        );
                        loadCrossHistory();
                      } catch (e: any) {
                        toast.error(e?.message || "Falha ao validar");
                      } finally {
                        setCrossLoading(false);
                      }
                    }}
                    disabled={crossLoading}
                  >
                    {crossLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
                    Rodar validação
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-xs space-y-3">
              {!crossResult ? (
                <p className="text-muted-foreground">Clique em <b>Rodar validação</b> para executar o validador cross-doc.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat
                      label="Score"
                      v={`${(Number(crossResult.score || 0) * 100).toFixed(0)}%`}
                      big
                      danger={Number(crossResult.score || 0) < 0.7}
                    />
                    <Stat label="Status" v={crossResult.passed ? "Aprovado ✓" : "Revisar ⚠"} big
                          danger={!crossResult.passed} />
                    <Stat label="Documentos" v={String(crossResult.checked ?? 0)} big />
                    <Stat label="Issues" v={String(crossResult.issues?.length ?? 0)} big
                          danger={(crossResult.issues?.length ?? 0) > 0} />
                  </div>

                  {crossResult.issues?.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-semibold">Inconsistências detectadas</div>
                      {crossResult.issues.map((iss: any, i: number) => {
                        const sevColor: Record<string, string> = {
                          critical: "hsl(0,84%,60%)",
                          high: "hsl(14,90%,53%)",
                          medium: "hsl(38,92%,50%)",
                          low: "hsl(217,91%,50%)",
                        };
                        const c = sevColor[iss.severity] || sevColor.medium;
                        return (
                          <div
                            key={i}
                            className="p-2.5 rounded border-l-4"
                            style={{ borderColor: c, background: `${c.replace(")", ",0.08)").replace("hsl", "hsla")}` }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold" style={{ color: c }}>
                                {iss.rule}
                              </span>
                              <Badge className="border-0 text-[10px]" style={{ background: `${c}25`, color: c }}>
                                {iss.severity}
                              </Badge>
                            </div>
                            <div className="mt-1 text-foreground">{iss.message}</div>
                            {iss.refs && (
                              <pre className="mt-1 text-[10px] text-muted-foreground overflow-auto">
                                {JSON.stringify(iss.refs, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {crossResult.summary && Object.keys(crossResult.summary).length > 0 && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Resumo técnico
                      </summary>
                      <pre className="bg-muted/30 p-2 rounded mt-1 overflow-auto">
                        {JSON.stringify(crossResult.summary, null, 2)}
                      </pre>
                    </details>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* === Histórico de validações === */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Histórico de Validações Cross-Doc
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Últimas execuções desta empresa em todos os períodos.
              </p>
            </CardHeader>
            <CardContent>
              {crossHistory.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Nenhuma validação registrada ainda.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Quando</th>
                      <th className="text-left">Período</th>
                      <th className="text-right">Score</th>
                      <th className="text-center">Status</th>
                      <th className="text-right">Docs</th>
                      <th className="text-right">Issues</th>
                      <th className="text-right">Snapshots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossHistory.map((h: any) => {
                      const sc = Number(h.score || 0);
                      const scColor = sc >= 0.7 ? "hsl(142,76%,36%)" : sc >= 0.4 ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)";
                      const issuesCount = Array.isArray(h.issues) ? h.issues.length : 0;
                      return (
                        <tr
                          key={h.id}
                          className="border-b border-border/20 hover:bg-muted/30 cursor-pointer"
                          onClick={() => {
                            setCrossResult({
                              score: h.score,
                              passed: h.passed,
                              checked: h.checked,
                              issues: h.issues || [],
                              summary: {},
                            });
                            if (h.ano) setYear(h.ano);
                            if (h.mes) setMonth(h.mes);
                          }}
                        >
                          <td className="py-1.5 text-muted-foreground">
                            {new Date(h.created_at).toLocaleString("pt-BR")}
                          </td>
                          <td>
                            {h.mes && h.ano ? `${String(h.mes).padStart(2, "0")}/${h.ano}` : "—"}
                          </td>
                          <td className="text-right font-semibold" style={{ color: scColor }}>
                            {(sc * 100).toFixed(0)}%
                          </td>
                          <td className="text-center">
                            <Badge
                              className="border-0 text-[10px]"
                              style={{
                                background: h.passed ? "hsl(142,76%,36%)/15" : "hsl(38,92%,50%)/15",
                                color: h.passed ? "hsl(142,76%,36%)" : "hsl(38,92%,50%)",
                              }}
                            >
                              {h.passed ? "Aprovado" : "Revisar"}
                            </Badge>
                          </td>
                          <td className="text-right">{h.checked ?? 0}</td>
                          <td className="text-right">
                            {issuesCount > 0 ? (
                              <span className="text-[hsl(38,92%,50%)] font-semibold">{issuesCount}</span>
                            ) : "—"}
                          </td>
                          <td className="text-right text-muted-foreground">
                            {h.persisted_versions || 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {subtab === "preview" && (
        <div className="space-y-4">
          <BalancetePreview
            companyId={id!}
            prospeccaoId={companyPeriod?.prospeccao_id || null}
            ano={year}
            mes={month}
            consolidado={consolidado}
          />
          <BalanceteVersoesCard
            companyId={isRealRma ? id! : null}
            ano={year}
            mes={month}
            onRestored={() => { loadConsolidado(); loadLancamentos(); loadConflicts(); }}
          />
        </div>
      )}

      {/* ===== AUDITORIA ===== */}
      {subtab === "auditoria" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lançamentos — {lancamentos.length} registros</CardTitle>
            <p className="text-xs text-muted-foreground">Revise lançamentos com baixa confiança ou status pendente</p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b-2">
                    <th className="text-left py-2 px-2 w-24">Conta</th>
                    <th className="text-left px-2">Descrição</th>
                    <th className="text-left px-2 w-32">Origem</th>
                    <th className="text-right px-2 w-28">Valor</th>
                    <th className="text-center px-2 w-20">Conf.</th>
                    <th className="text-center px-2 w-24">Status</th>
                    <th className="text-center px-2 w-32">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map(l => {
                    const conf = Number(l.confianca_mapeamento || 0);
                    const confColor = conf >= 0.7 ? "hsl(142,76%,36%)" : conf >= 0.5 ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)";
                    return (
                      <tr key={l.id} className="border-b border-border/10 hover:bg-muted/20">
                        <td className="py-1.5 px-2 font-mono">{l.conta || "—"}</td>
                        <td className="px-2">
                          <div>{l.descricao_padronizada || l.descricao_original}</div>
                          {l.descricao_padronizada && l.descricao_padronizada !== l.descricao_original && (
                            <div className="text-[10px] text-muted-foreground">↳ {l.descricao_original}</div>
                          )}
                        </td>
                        <td className="px-2 text-muted-foreground truncate max-w-[140px]" title={l.origem_arquivo}>
                          {l.origem_arquivo || "—"}
                        </td>
                        <td className="px-2 text-right font-mono">{fmtBRL(l.valor)}</td>
                        <td className="px-2 text-center font-semibold" style={{ color: confColor }}>
                          {(conf * 100).toFixed(0)}%
                        </td>
                        <td className="px-2 text-center">
                          <Badge className="text-[10px] border-0" variant={
                            l.status === "ok" ? "default" :
                            l.status === "rejected" ? "destructive" : "secondary"
                          }>{l.status}</Badge>
                        </td>
                        <td className="px-2 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                                    disabled={reviewing === l.id}
                                    onClick={() => reviewLancamento(l.id, "ok")}>OK</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive"
                                    disabled={reviewing === l.id}
                                    onClick={() => reviewLancamento(l.id, "rejected")}>X</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {lancamentos.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sem lançamentos para este período</td></tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Stat = ({ label, v, big, danger }: { label: string; v: string; big?: boolean; danger?: boolean }) => (
  <div className={`p-3 rounded-lg border ${danger ? "bg-destructive/5 border-destructive/30" : "bg-muted/20"}`}>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`font-bold ${big ? "text-lg" : "text-sm"} ${danger ? "text-destructive" : ""}`}>{v}</div>
  </div>
);

export default ProspeccaoBalanceteTab;
