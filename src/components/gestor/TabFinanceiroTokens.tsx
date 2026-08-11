import { useEffect, useMemo, useState } from "react";
import {
  Wallet, DollarSign, Activity, Sparkles, AlertTriangle,
  RefreshCw, Info, Save, RotateCcw, FileText, ChevronDown, ChevronUp,
  Receipt, ClipboardList, FileSearch, FileCheck2, FileBarChart2,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  fetchCostConfig, fetchCostIndicators, fetchUsageLogs, runCostDiagnostics, upsertCostConfig,
  type CostConfigRow, type CostIndicators, type PeriodKey, type UsageLogRow,
} from "@/services/gestorIaCostService";

// 5 tipos de relatórios Prospecção acompanhados financeiramente
const REPORT_TYPES = [
  { key: "registro_cobranca",  label: "Relatório de Registro e Cobrança", icon: Receipt,       color: "hsl(200,80%,55%)",
    matchers: [/registro/i, /cobran/i] },
  { key: "pre_parecer",        label: "Revisão-Parecer Técnico",          icon: ClipboardList, color: "hsl(258,90%,66%)",
    matchers: [/pre[_-]?parecer/i, /pré[-_ ]?parecer/i, /pre[_-]?relat/i] },
  { key: "pre_relatorio",      label: "Revisão-Relatório Prospecção AJ",            icon: FileSearch,    color: "hsl(190,70%,50%)",
    matchers: [/pre[_-]?relat/i, /pré[-_ ]?relat/i, /prospecção[_-]?mensal/i] },
  { key: "parecer_final",      label: "Parecer Técnico Final",            icon: FileCheck2,    color: "hsl(152,70%,45%)",
    matchers: [/parecer[_-]?final/i, /^parecer_tecnico$/i] },
  { key: "relatorio_final",    label: "Relatório Prospecção AJ Final",                  icon: FileBarChart2, color: "hsl(38,90%,55%)",
    matchers: [/relat[oó]rio[_-]?final/i, /prospecção[_-]?final/i] },
] as const;

function classifyReportLog(l: UsageLogRow): string {
  const meta = (l.metadata ?? {}) as Record<string, unknown>;
  const hay = [
    meta.report_type, meta.documento_tipo, meta.tipo, meta.section,
    (meta as any).prospecção_doc_tipo, (meta as any).fn, (meta as any).tool,
    (meta as any).file, l.type,
  ].map((v) => String(v ?? "")).join(" ");
  for (const rt of REPORT_TYPES) {
    if (rt.matchers.some((re) => re.test(hay))) return rt.key;
  }
  // Fallback: logs de extração/OCR/embedding alimentam o Revisão-Relatório Prospecção
  return "pre_relatorio";
}

const PERIOD_OPTS: { key: PeriodKey; label: string }[] = [
  { key: "mes",       label: "Mês"        },
  { key: "trimestre", label: "Trimestre"  },
  { key: "semestre",  label: "Semestre"   },
  { key: "ano",       label: "Ano"        },
  { key: "total",     label: "Total"      },
];

const USD_TO_BRL = 5.20; // taxa de conversão USD → BRL
const fmtBRL  = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const fmtUSDc = (n: number) => `R$ ${(n * USD_TO_BRL).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const fmtUSD  = (n: number) => `R$ ${(n * USD_TO_BRL).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const parseBR = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

const COLORS = [
  "hsl(258,90%,66%)", "hsl(200,80%,55%)", "hsl(152,70%,45%)",
  "hsl(38,90%,55%)", "hsl(0,80%,55%)", "hsl(280,70%,55%)", "hsl(190,70%,50%)",
];

const DEFAULT_INFRA = [
  { service: "infra_compute",   label: "Compute",    spec: "n4-standard-2 · 2 vCPU · 8 GB RAM", monthly: 394.10, refReports: 700 },
  { service: "infra_boot_disk", label: "Boot disk",  spec: "10 GiB",                            monthly: 4.76,   refReports: 700 },
  { service: "infra_bigquery",  label: "BigQuery",   spec: "On-Demand",                          monthly: 138.82, refReports: 700 },
  { service: "infra_cloudsql",  label: "Cloud SQL",  spec: "PostgreSQL",                         monthly: 146.81, refReports: 700 },
  { service: "infra_storage",   label: "Storage",    spec: "1000 GiB",                           monthly: 118.45, refReports: 700 },
];

const LS_PERIOD = "gestor.financeiro.period";
const LS_E2E    = "gestor.e2eDetail.open";
const LS_STAGE  = "gestor.stageDetail.open";
const LS_INFRA  = "bex.infraRows.v1";

const TabFinanceiroTokens = () => {
  const { toast } = useToast();
  const [period, setPeriod] = useState<PeriodKey>(() => (localStorage.getItem(LS_PERIOD) as PeriodKey) || "mes");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [data, setData] = useState<CostIndicators | null>(null);
  const [config, setConfig] = useState<CostConfigRow[]>([]);
  const [logs, setLogs] = useState<UsageLogRow[]>([]);
  const [bufs, setBufs] = useState<Record<string, string>>({});
  const [e2eOpen, setE2eOpen] = useState(() => localStorage.getItem(LS_E2E) === "1");
  const [stageOpen, setStageOpen] = useState(() => localStorage.getItem(LS_STAGE) === "1");
  const [infra, setInfra] = useState(() => {
    try { const v = localStorage.getItem(LS_INFRA); return v ? JSON.parse(v) : DEFAULT_INFRA; }
    catch { return DEFAULT_INFRA; }
  });

  useEffect(() => { localStorage.setItem(LS_PERIOD, period); }, [period]);
  useEffect(() => { localStorage.setItem(LS_E2E, e2eOpen ? "1" : "0"); }, [e2eOpen]);
  useEffect(() => { localStorage.setItem(LS_STAGE, stageOpen ? "1" : "0"); }, [stageOpen]);

  const reload = async () => {
    setLoading(true);
    try {
      const [ind, cfg, lg] = await Promise.all([fetchCostIndicators(period), fetchCostConfig(), fetchUsageLogs()]);
      setData(ind);
      setConfig(cfg);
      setLogs(lg);
    } catch (e) {
      toast({ title: "Erro ao carregar custos", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [period]);

  const runDiag = async () => {
    setRunning(true);
    try {
      const r = await runCostDiagnostics();
      toast({
        title: "Diagnóstico concluído",
        description: `${r.adjustments} ajustes · Δ ${fmtUSDc(r.deltaTotal)} · ${r.ignored} ignorado(s)`,
      });
      await reload();
    } catch (e) {
      toast({ title: "Falha no diagnóstico", description: (e as Error).message, variant: "destructive" });
    } finally { setRunning(false); }
  };

  const bufKey = (id: string, field: string) => `${id}|${field}`;
  const getBuf = (id: string, field: string, fallback: number) =>
    bufs[bufKey(id, field)] ?? String(fallback).replace(".", ",");

  const saveRow = async (row: CostConfigRow) => {
    try {
      const updated: CostConfigRow = {
        ...row,
        cost_per_1k_input:  parseBR(getBuf(row.id, "cost_per_1k_input",  row.cost_per_1k_input)),
        cost_per_1k_output: parseBR(getBuf(row.id, "cost_per_1k_output", row.cost_per_1k_output)),
        cost_per_request:   parseBR(getBuf(row.id, "cost_per_request",   row.cost_per_request)),
        cost_per_page:      parseBR(getBuf(row.id, "cost_per_page",      row.cost_per_page)),
        cost_fixed:         parseBR(getBuf(row.id, "cost_fixed",         row.cost_fixed)),
      };
      await upsertCostConfig(updated);
      toast({ title: "Preço atualizado", description: row.label });
      await reload();
    } catch (e) {
      toast({ title: "Erro ao salvar", description: (e as Error).message, variant: "destructive" });
    }
  };

  const totalInfraMonthly = useMemo(() => infra.reduce((a: number, r: { monthly: number }) => a + (+r.monthly || 0), 0), [infra]);
  const refReports = infra[0]?.refReports || 700;
  const infraPerReport = refReports > 0 ? totalInfraMonthly / refReports : 0;

  const saveInfra = () => {
    localStorage.setItem(LS_INFRA, JSON.stringify(infra));
    toast({ title: "Infraestrutura salva", description: "Persistido localmente." });
  };
  const resetInfra = () => { setInfra(DEFAULT_INFRA); localStorage.removeItem(LS_INFRA); };

  const e2eTotal = (data?.custoTotal ?? 0) + (totalInfraMonthly);
  const custoMedioE2E = data && (data.totalBalancetes + data.totalRelatorios) > 0
    ? e2eTotal / (data.totalBalancetes + data.totalRelatorios)
    : 0;

  // Custos por tipo de relatório Prospecção (período corrente)
  const periodCutoff = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "mes":       return new Date(now.getFullYear(), now.getMonth(), 1);
      case "trimestre": return new Date(now.getFullYear(), now.getMonth() - 2, 1);
      case "semestre":  return new Date(now.getFullYear(), now.getMonth() - 5, 1);
      case "ano":       return new Date(now.getFullYear(), now.getMonth() - 11, 1);
      default:          return null;
    }
  }, [period]);

  const reportStats = useMemo(() => {
    const stats: Record<string, { total: number; docs: Set<string>; count: number }> = {};
    for (const rt of REPORT_TYPES) stats[rt.key] = { total: 0, docs: new Set(), count: 0 };
    const filtered = periodCutoff ? logs.filter((l) => new Date(l.created_at) >= periodCutoff) : logs;
    for (const l of filtered) {
      const k = classifyReportLog(l);
      if (!k || !stats[k]) continue;
      stats[k].total += +l.cost_calculated || 0;
      stats[k].count += 1;
      if (l.document_id) stats[k].docs.add(l.document_id);
    }
    return stats;
  }, [logs, periodCutoff]);

  // Custo Total (E2E) = soma dos 5 relatórios (custo total acumulado da empresa no Prospecção)
  const custoTotalProspecçãoReports = useMemo(
    () => REPORT_TYPES.reduce((acc, rt) => acc + (reportStats[rt.key]?.total ?? 0), 0),
    [reportStats],
  );
  const totalDocsProspecçãoReports = useMemo(() => {
    const all = new Set<string>();
    for (const rt of REPORT_TYPES) reportStats[rt.key]?.docs.forEach((d) => all.add(d));
    return all.size;
  }, [reportStats]);
  const custoMedioProspecção = totalDocsProspecçãoReports > 0 ? custoTotalProspecçãoReports / totalDocsProspecçãoReports : 0;

  // Custo médio por Relatório Final (Prospecção)
  const custoRelatorioFinal = (() => {
    const s = reportStats["relatorio_final"];
    return s && s.docs.size > 0 ? s.total / s.docs.size : 0;
  })();

  // Custo de IA + OCR de processamento de documentos (extração, OCR, embeddings, classificação)
  const custoIaOcrProcessamento = useMemo(() => {
    const filtered = periodCutoff ? logs.filter((l) => new Date(l.created_at) >= periodCutoff) : logs;
    const PROC_TYPES = new Set(["ocr", "extraction", "classification", "embedding", "validation"]);
    let total = 0;
    for (const l of filtered) {
      const t = String(l.type ?? "").toLowerCase();
      const svc = String(l.service ?? "").toLowerCase();
      const isProc = PROC_TYPES.has(t)
        || svc.includes("vision")
        || svc.includes("document_ai")
        || svc.includes("embedding");
      if (isProc) total += +l.cost_calculated || 0;
    }
    return total;
  }, [logs, periodCutoff]);

  const KPI = ({ icon: Icon, label, value, sub, color }: { icon: typeof Wallet; label: string; value: string; sub: string; color: string }) => (
    <div className="bg-card rounded-xl border border-border p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-[hsl(258,90%,66%)]" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Controle Financeiro de Tokens e APIs</h3>
            <p className="text-xs text-muted-foreground">Custo real de cada operação de IA — baseado em <b>uso efetivo</b> registrado pelo pipeline.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-muted/40 border border-border rounded-lg p-1">
            {PERIOD_OPTS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  period === p.key
                    ? "bg-[hsl(258,90%,66%)] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >{p.label}</button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={runDiag} disabled={running} className="gap-1.5 bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)]">
            <Sparkles className="w-3.5 h-3.5" /> {running ? "Executando..." : "Executar Diagnóstico"}
          </Button>
        </div>
      </div>

      {/* KPIs principais — médias REAIS por unidade da platafoprospecção */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPI
          icon={FileText}
          label="Custo por Relatório Prospecção AJ Final"
          value={data ? fmtUSDc(data.custoMedioPorRelatorio) : "—"}
          sub={data ? `${data.counts.relatoriosFinalizados + data.counts.relatoriosEmElaboracao} relatório(s) · ${data.counts.relatoriosFinalizados} finalizado(s)` : "—"}
          color="hsl(258,90%,66%)"
        />
        <KPI
          icon={DollarSign}
          label="Custo por Balancete"
          value={data ? fmtUSDc(data.custoMedioPorBalancete) : "—"}
          sub={data ? `${data.counts.balancetesRuns} run(s) · ${data.counts.balancetesConsolidados} consolidado(s)` : "—"}
          color="hsl(152,70%,45%)"
        />
        <KPI
          icon={Wallet}
          label="Custo Total (E2E)"
          value={data ? fmtUSDc(data.custoTotal) : "—"}
          sub={data ? `Σ IA · ${data.counts.prospecçãosTotal} Prospecção(s) na platafoprospecção` : "—"}
          color="hsl(200,80%,55%)"
        />
        <KPI
          icon={Activity}
          label="Custo Médio por Prospecção AJ"
          value={data ? fmtUSDc(data.custoMedioPorProspecção) : "—"}
          sub={data ? `Custo total ÷ ${data.counts.prospecçãosTotal} Prospecção(s) (análise → conclusão)` : "—"}
          color="hsl(38,90%,55%)"
        />
        <KPI
          icon={FileSearch}
          label="Custo IA + OCR Processamento"
          value={data ? fmtUSDc(data.custoIaOcrProcessamento) : "—"}
          sub={data ? `OCR, extração, embeddings · ${data.counts.documentosOcr} documento(s)` : "—"}
          color="hsl(190,70%,50%)"
        />
      </div>

      {/* Custo por tipo de Relatório Prospecção — médias acumuladas */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h4 className="font-semibold text-foreground flex items-center gap-2">
              <FileBarChart2 className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Custo médio por tipo de Relatório Prospecção
            </h4>
            <p className="text-xs text-muted-foreground">Custo acumulado ÷ documentos únicos por relatório · período: <b>{data?.periodLabel}</b></p>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {REPORT_TYPES.map((rt) => {
            const s = reportStats[rt.key];
            const docs = s?.docs.size ?? 0;
            const avg = docs > 0 ? s.total / docs : 0;
            const total = s?.total ?? 0;
            const pct = custoTotalProspecçãoReports > 0 ? (total / custoTotalProspecçãoReports) * 100 : 0;
            const Icon = rt.icon;
            return (
              <div
                key={rt.key}
                className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow"
              >
                <div
                  className="px-4 py-2 text-xs font-semibold text-white truncate"
                  style={{ background: rt.color }}
                  title={rt.label}
                >
                  {rt.label}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: `${rt.color}15` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: rt.color }} />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-2xl font-bold font-mono text-foreground leading-tight">{fmtUSDc(avg)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Custo médio por documento</p>
                  <div className="mt-3 pt-3 border-t border-border space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Documentos</span>
                      <span className="font-mono font-semibold text-foreground">{docs}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total acumulado</span>
                      <span className="font-mono font-semibold text-foreground">{fmtUSDc(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detalhe Custo Médio por Etapa do Prospecção — colapsável */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setStageOpen((v) => !v)}
          className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <span className="font-semibold text-foreground flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Custo médio por etapa do Prospecção
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Σ médio: <b className="font-mono text-foreground">{fmtUSDc(
                REPORT_TYPES.reduce((acc, rt) => {
                  const s = reportStats[rt.key];
                  const docs = s?.docs.size ?? 0;
                  return acc + (docs > 0 ? s.total / docs : 0);
                }, 0)
              )}</b>
            </span>
            {stageOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>
        {stageOpen && (
          <div className="border-t border-border p-5">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="text-left py-2 font-semibold text-muted-foreground">Etapa do Prospecção AJ</th>
                <th className="text-right py-2 font-semibold text-muted-foreground">Documentos</th>
                <th className="text-right py-2 font-semibold text-muted-foreground">Custo médio / doc</th>
                <th className="text-right py-2 font-semibold text-muted-foreground">Total acumulado</th>
                <th className="text-right py-2 font-semibold text-muted-foreground">% do total</th>
              </tr></thead>
              <tbody>
                {REPORT_TYPES.map((rt) => {
                  const s = reportStats[rt.key];
                  const docs = s?.docs.size ?? 0;
                  const total = s?.total ?? 0;
                  const avg = docs > 0 ? total / docs : 0;
                  const pct = custoTotalProspecçãoReports > 0 ? (total / custoTotalProspecçãoReports) * 100 : 0;
                  return (
                    <tr key={rt.key} className="border-b border-border last:border-0">
                      <td className="py-2 text-foreground flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: rt.color }} />
                        {rt.label}
                      </td>
                      <td className="py-2 text-right font-mono">{docs}</td>
                      <td className="py-2 text-right font-mono">{fmtUSDc(avg)}</td>
                      <td className="py-2 text-right font-mono">{fmtUSDc(total)}</td>
                      <td className="py-2 text-right font-mono text-muted-foreground">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
                <tr className="bg-[hsl(258,90%,66%)]/10">
                  <td className="py-2 font-bold">Total geral Prospecção AJ</td>
                  <td className="py-2 text-right font-mono font-bold">{totalDocsProspecçãoReports}</td>
                  <td className="py-2 text-right font-mono font-bold">{fmtUSDc(custoMedioProspecção)}</td>
                  <td className="py-2 text-right font-mono font-bold">{fmtUSDc(custoTotalProspecçãoReports)}</td>
                  <td className="py-2 text-right font-mono font-bold">100,0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* E2E detalhe */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setE2eOpen((v) => !v)}
          className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <span className="font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Detalhe E2E (IA + Infra)
          </span>
          {e2eOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {e2eOpen && (
          <div className="border-t border-border p-5">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">
                <th className="text-left py-2 font-semibold text-muted-foreground">Componente</th>
                <th className="text-right py-2 font-semibold text-muted-foreground">Custo (período)</th>
                <th className="text-right py-2 font-semibold text-muted-foreground">% do total</th>
              </tr></thead>
              <tbody>
                {(data?.breakdown ?? []).map((b) => (
                  <tr key={b.service} className="border-b border-border last:border-0">
                    <td className="py-2 text-foreground">{b.label}</td>
                    <td className="py-2 text-right font-mono">{fmtUSDc(b.cost)}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{b.pct.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="border-b border-border bg-muted/30">
                  <td className="py-2 font-semibold">Subtotal IA</td>
                  <td className="py-2 text-right font-mono font-semibold">{fmtUSDc(data?.custoTotal ?? 0)}</td>
                  <td className="py-2"></td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-2 text-foreground">Infraestrutura GCP (mensal)</td>
                  <td className="py-2 text-right font-mono">{fmtUSDc(totalInfraMonthly)}</td>
                  <td className="py-2"></td>
                </tr>
                <tr className="bg-[hsl(258,90%,66%)]/10">
                  <td className="py-2 font-bold">Total E2E</td>
                  <td className="py-2 text-right font-mono font-bold">{fmtUSDc(e2eTotal)}</td>
                  <td className="py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h4 className="font-semibold text-foreground mb-4">Distribuição por agente</h4>
          {(data?.breakdown ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data!.breakdown} dataKey="cost" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {data!.breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip foprospecçãotter={(v: number) => fmtUSDc(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-12">Sem dados no período.</p>}
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h4 className="font-semibold text-foreground mb-4">Evolução mensal (12 meses)</h4>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data?.monthlySeries ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,88%)" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip foprospecçãotter={(v: number) => fmtUSDc(v)} />
              <Area type="monotone" dataKey="custo" stroke="hsl(258,90%,66%)" fill="hsl(258,90%,66%)" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h4 className="font-semibold text-foreground mb-4">Últimos 6 meses</h4>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data?.last6Months ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,88%)" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip foprospecçãotter={(v: number) => fmtUSDc(v)} />
            <Bar dataKey="custo" fill="hsl(200,80%,55%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela de preços */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h4 className="font-semibold text-foreground">Tabela de preços (ai_cost_config)</h4>
          <p className="text-xs text-muted-foreground mt-1">Edite e clique em <b>Salvar</b> linha a linha (valores em R$ BR — convertidos a partir de USD à taxa {USD_TO_BRL.toFixed(2)}).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/40 text-xs">
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Provedor</th>
              <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Serviço</th>
              <th className="text-right px-3 py-2 font-semibold text-muted-foreground">/1k input</th>
              <th className="text-right px-3 py-2 font-semibold text-muted-foreground">/1k output</th>
              <th className="text-right px-3 py-2 font-semibold text-muted-foreground">/req</th>
              <th className="text-right px-3 py-2 font-semibold text-muted-foreground">/página</th>
              <th className="text-right px-3 py-2 font-semibold text-muted-foreground">fixo</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {config.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground">{row.provider}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{row.label}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{row.service}</div>
                  </td>
                  {(["cost_per_1k_input","cost_per_1k_output","cost_per_request","cost_per_page","cost_fixed"] as const).map((f) => (
                    <td key={f} className="px-3 py-2 text-right">
                      <Input
                        className="h-8 w-28 text-right font-mono text-xs"
                        value={getBuf(row.id, f, row[f])}
                        onChange={(e) => setBufs((b) => ({ ...b, [bufKey(row.id, f)]: e.target.value }))}
                        placeholder={fmtUSD(row[f])}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => saveRow(row)} className="gap-1 h-8 text-xs">
                      <Save className="w-3 h-3" /> Salvar
                    </Button>
                  </td>
                </tr>
              ))}
              {config.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Nenhum preço configurado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Infra GCP */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-foreground">Infraestrutura GCP</h4>
            <p className="text-xs text-muted-foreground mt-1">Persistido localmente — total mensal e custo/relatório calculados.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={saveInfra} className="gap-1 text-xs"><Save className="w-3 h-3" /> Salvar</Button>
            <Button size="sm" variant="ghost" onClick={resetInfra} className="gap-1 text-xs"><RotateCcw className="w-3 h-3" /> Padrões</Button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/40 text-xs">
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Serviço</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Spec</th>
            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Mensal (R$)</th>
            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Relatórios ref</th>
          </tr></thead>
          <tbody>
            {infra.map((r: typeof DEFAULT_INFRA[number], i: number) => (
              <tr key={r.service} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-foreground font-medium">{r.label}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{r.spec}</td>
                <td className="px-3 py-2 text-right">
                  <Input className="h-8 w-28 text-right font-mono text-xs ml-auto"
                    value={String(r.monthly).replace(".", ",")}
                    onChange={(e) => setInfra((rows: typeof DEFAULT_INFRA) => rows.map((x, j) => j === i ? { ...x, monthly: parseBR(e.target.value) } : x))} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Input className="h-8 w-24 text-right font-mono text-xs ml-auto"
                    value={String(r.refReports)}
                    onChange={(e) => setInfra((rows: typeof DEFAULT_INFRA) => rows.map((x, j) => j === i ? { ...x, refReports: Number(e.target.value) || 0 } : x))} />
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-3 py-2" colSpan={2}>Total</td>
              <td className="px-3 py-2 text-right font-mono">{fmtBRL(totalInfraMonthly)}</td>
              <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{fmtUSDc(infraPerReport)} / relatório</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Insights */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h4 className="font-semibold text-foreground flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Insights automáticos
        </h4>
        {(data?.insights ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum insight relevante no período.</p>
        ) : (
          <div className="space-y-2">
            {data!.insights.map((ins, i) => {
              const styles = {
                critical: { bg: "bg-destructive/10", border: "border-destructive", icon: "text-destructive" },
                warning:  { bg: "bg-yellow-500/10", border: "border-yellow-500",   icon: "text-yellow-600"  },
                info:     { bg: "bg-blue-500/10",   border: "border-blue-500",     icon: "text-blue-600"    },
              }[ins.level];
              return (
                <div key={i} className={`p-3 rounded-lg border ${styles.bg} ${styles.border}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${styles.icon}`} />
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-foreground">{ins.alerta}</p>
                      <p className="text-xs text-muted-foreground mt-1">📌 {ins.causa}</p>
                      <p className="text-xs text-foreground mt-1">💡 {ins.acao}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TabFinanceiroTokens;
