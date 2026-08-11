/**
 * AuditoriaCard — Card consolidado de Auditoria exibido após o Processamento da IA.
 *
 * Melhorias v3:
 *  - Persistência da aba ativa por prospecçãoId em localStorage + URL (?atab=).
 *  - Filtro de período (de/até) + atalhos rápidos (3m / 6m / 12m / YTD).
 *  - Exportação CSV das tabelas e Export XLSX consolidado (multi-aba).
 *  - Cards-resumo no topo de Indicadores (KPIs com Δ vs mês anterior).
 */
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ShieldCheck, FileText, ExternalLink, AlertTriangle, CheckCircle2, Calendar, Download, TrendingUp, TrendingDown, Minus, FileSpreadsheet, Printer, AlertCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TabBSDados from "@/components/bsDados/TabBSDados";
import TabPivotConsolidado from "@/components/bsDados/TabPivotConsolidado";
import TabGraficosAuditoria from "@/components/audit/TabGraficosAuditoria";
import TabIndicadores from "@/components/audit/TabIndicadores";
import TabKanitz from "@/components/audit/TabKanitz";
import { buildBSDados, type BSDadosRow } from "@/services/bsDadosBuilder";
import { buildIndicatorSeries, buildISGSeries } from "@/services/indicatorsEngine";
import { buildKanitzMonthlySeries, summarizeKanitzSeries } from "@/services/kanitzMonthly";

interface AuditoriaCardProps {
  companyId: string | null;
  runToken: string;
  bsParsed: any;
  bsEntries: any;
  prospecçãoId?: string | null;
  loading?: boolean;
}

type TabKey =
  | "indicadores"
  | "endividamento"
  | "patrimonial"
  | "bsdados"
  | "pivot"
  | "graficos"
  | "riscorj"
  | "kanitz";

const TABS: { key: TabKey; label: string }[] = [
  { key: "indicadores",   label: "Indicadores" },
  { key: "endividamento", label: "Endividamento" },
  { key: "patrimonial",   label: "Patrimonial" },
  { key: "bsdados",       label: "BS & Dados" },
  { key: "pivot",         label: "Pivot" },
  { key: "graficos",      label: "Gráficos de Auditoria" },
  { key: "riscorj",       label: "Risco RJ" },
  { key: "kanitz",        label: "Kanitz" },
];

const fmt = (v?: number | null, dec = 2) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(dec).replace(".", ",");
const fmtPct = (v?: number | null) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : `${(Number(v) * 100).toFixed(1).replace(".", ",")}%`;
const fmtBR = (v?: number | null) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {msg}
    </div>
  );
}

/** Dispara download CSV no navegador a partir de uma matriz [linhas][colunas]. */
function downloadCSV(filename: string, rows: (string | number)[][]) {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} className="h-7 gap-1.5 text-xs">
      <Download className="h-3.5 w-3.5" /> Exportar CSV
    </Button>
  );
}

/** Mini-sparkline SVG. */
function Sparkline({ values, color = "hsl(217,91%,50%)", w = 80, h = 20 }: { values: (number | null | undefined)[]; color?: string; w?: number; h?: number }) {
  const nums = values.map(v => (v == null || !Number.isFinite(Number(v)) ? null : Number(v)));
  const valid = nums.filter((v): v is number => v != null);
  if (valid.length < 2) return <span className="text-[10px] text-muted-foreground">—</span>;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const stepX = w / (nums.length - 1);
  const pts: string[] = [];
  nums.forEach((v, i) => {
    if (v == null) return;
    const x = i * stepX;
    const y = h - ((v - min) / range) * h;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  const lastIdx = nums.length - 1;
  const lastV = nums[lastIdx];
  const lastX = lastIdx * stepX;
  const lastY = lastV == null ? h / 2 : h - ((lastV - min) / range) * h;
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline fill="none" stroke={color} strokeWidth="1.2" points={pts.join(" ")} />
      <circle cx={lastX} cy={lastY} r="1.6" fill={color} />
    </svg>
  );
}

/* ─────────────── Indicadores ─────────────── */
const IND_ROWS: [string, string, "n" | "pct" | "i" | "br"][] = [
  ["Liquidez Corrente",   "liquidezCorrente",   "n"],
  ["Liquidez Seca",       "liquidezSeca",       "n"],
  ["Liquidez Imediata",   "liquidezImediata",   "n"],
  ["Liquidez Geral",      "liquidezGeral",      "n"],
  ["Margem Líquida",      "margemLiquida",      "pct"],
  ["Margem Operacional",  "margemOperacional",  "pct"],
  ["ROA (anual.)",        "roa",                "pct"],
  ["ROE (anual.)",        "roe",                "pct"],
  ["Giro do Ativo",       "giroAtivo",          "n"],
  ["PMR (dias)",          "pmr",                "i"],
  ["PMP (dias)",          "pmp",                "i"],
  ["IME (dias)",          "idadeMediaEstoque",  "i"],
  ["Ciclo Operacional",   "cicloOperacional",   "i"],
  ["Ciclo de Caixa",      "cicloCaixa",         "i"],
  ["EBITDA",              "ebitda",             "br"],
];

/** Card-resumo de KPI com Δ vs período anterior. */
function KpiTile({
  label, value, delta, kind, higherIsBetter = true,
}: { label: string; value: number | null | undefined; delta: number | null; kind: "pct" | "n"; higherIsBetter?: boolean }) {
  const fmtV = (v?: number | null) => kind === "pct" ? fmtPct(v) : fmt(v);
  const noDelta = delta == null || !Number.isFinite(delta);
  const positive = !noDelta && delta! > 0;
  const negative = !noDelta && delta! < 0;
  const good = (positive && higherIsBetter) || (negative && !higherIsBetter);
  const color = noDelta ? "hsl(var(--muted-foreground))" : good ? "hsl(142,76%,36%)" : "hsl(0,84%,55%)";
  const Icon = noDelta ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-foreground">{fmtV(value)}</div>
      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium" style={{ color }}>
        <Icon className="h-3 w-3" />
        {noDelta ? "—" : `${positive ? "+" : ""}${kind === "pct" ? fmtPct(delta) : fmt(delta)} vs mês ant.`}
      </div>
    </div>
  );
}

function PanelIndicadores({ rows }: { rows: BSDadosRow[] }) {
  const series = useMemo(() => buildIndicatorSeries(rows), [rows]);
  const keys = Object.keys(series).sort();
  if (!keys.length) return <Empty msg="Sem base BS & Dados para calcular indicadores." />;

  // Detecta dados insuficientes: indicadores básicos todos zerados/ausentes em todos os períodos.
  const insufficient = keys.every(k => {
    const s = series[k] as any;
    const vals = [s?.liquidezCorrente, s?.liquidezGeral, s?.margemLiquida, s?.roe, s?.giroAtivo];
    return vals.every(v => !Number.isFinite(v) || v === 0);
  });
  if (insufficient) {
    return (
      <Empty msg="Indicadores não puderam ser calculados — o balancete consolidado não contém a classificação detalhada de contas (Ativo Circulante, Estoques, Disponível, etc.) necessária para liquidez/rentabilidade. Reprocesse os documentos para obter o plano de contas completo." />
    );
  }

  const last = series[keys[keys.length - 1]] as any;
  const prev = keys.length > 1 ? (series[keys[keys.length - 2]] as any) : null;
  const delta = (f: string) => (prev && Number.isFinite(last?.[f]) && Number.isFinite(prev?.[f])) ? last[f] - prev[f] : null;

  const handleExport = () => {
    const header = ["Indicador", ...keys.map(k => series[k].mes)];
    const body = IND_ROWS.map(([label, field]) => [label, ...keys.map(k => (series[k] as any)[field] ?? "")]);
    downloadCSV("auditoria-indicadores.csv", [header, ...body]);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Liquidez Corrente"  value={last.liquidezCorrente}   delta={delta("liquidezCorrente")}   kind="n"   higherIsBetter />
        <KpiTile label="Margem Líquida"     value={last.margemLiquida}      delta={delta("margemLiquida")}      kind="pct" higherIsBetter />
        <KpiTile label="ROE (anual.)"       value={last.roe}                delta={delta("roe")}                kind="pct" higherIsBetter />
        <KpiTile label="Endividamento Geral" value={last.endividamentoGeral} delta={delta("endividamentoGeral")} kind="pct" higherIsBetter={false} />
      </div>
      <div className="flex justify-end"><ExportButton onClick={handleExport} /></div>
      {/* Nova aba: 4 quadros (Liquidez · Endividamento · Atividade · Rentabilidade) + EBITDA */}
      <TabIndicadores rows={rows} />
    </div>
  );
}

/* ─────────────── Endividamento ─────────────── */
const END_ROWS: [string, string, "n" | "pct"][] = [
  ["Endividamento Geral (PT/AT)",       "endividamentoGeral",       "pct"],
  ["Grau de Endividamento s/ PL",       "grauEndividamentoPL",      "n"],
  ["Composição do Endividamento (CP)",  "composicaoEndividamento",  "pct"],
  ["Composição do Endividamento (LP)",  "composicaoEndividamentoLP","pct"],
  ["Imobilização do PL",                "imobilizacaoPL",           "pct"],
  ["Cobertura de Juros",                "coberturaJuros",           "n"],
];

function PanelEndividamento({ rows }: { rows: BSDadosRow[] }) {
  const series = useMemo(() => buildIndicatorSeries(rows), [rows]);
  const keys = Object.keys(series).sort();
  if (!keys.length) return <Empty msg="Sem dados de Passivo para análise de endividamento." />;

  const handleExport = () => {
    const header = ["Métrica", ...keys.map(k => series[k].mes)];
    const body = END_ROWS.map(([label, field]) => [label, ...keys.map(k => (series[k] as any)[field] ?? "")]);
    downloadCSV("auditoria-endividamento.csv", [header, ...body]);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end"><ExportButton onClick={handleExport} /></div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-xs tabular-nums">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Métrica</th>
              <th className="px-3 py-2 text-center font-semibold print:hidden">Tend.</th>
              {keys.map(k => <th key={k} className="px-3 py-2 text-right font-semibold">{series[k].mes}</th>)}
            </tr>
          </thead>
          <tbody>
            {END_ROWS.map(([label, field, kind]) => {
              const vals = keys.map(k => (series[k] as any)[field] as number);
              return (
                <tr key={field} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{label}</td>
                  <td className="px-2 py-1 text-center print:hidden"><Sparkline values={vals} /></td>
                  {keys.map((k, i) => (
                    <td key={k} className="px-3 py-2 text-right">{kind === "pct" ? fmtPct(vals[i]) : fmt(vals[i])}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────── Patrimonial ─────────────── */
const PAT_ROWS: [string, string, boolean?][] = [
  ["Disponível",                "disponivel"],
  ["Estoques",                  "estoques"],
  ["Ativo Circulante",          "ativo_circulante", true],
  ["Ativo Não Circulante",      "ativo_nao_circulante", true],
  ["Ativo Total",               "__at", true],
  ["Passivo Circulante",        "passivo_circulante", true],
  ["Passivo Não Circulante",    "passivo_nao_circulante", true],
  ["Patrimônio Líquido",        "patrimonio_liquido", true],
  ["Passivo + PL",              "__pasPl", true],
  ["Equilíbrio (AT − P − PL)",  "__diff"],
];

function patValue(r: BSDadosRow, field: string): number {
  const ac = r.ativo_circulante || 0;
  const anc = r.ativo_nao_circulante || 0;
  const pc = r.passivo_circulante || 0;
  const pnc = r.passivo_nao_circulante || 0;
  const pl = r.patrimonio_liquido || 0;
  if (field === "__at") return ac + anc;
  if (field === "__pasPl") return pc + pnc + pl;
  if (field === "__diff") return (ac + anc) - (pc + pnc + pl);
  return (r as any)[field] || 0;
}

function PanelPatrimonial({ rows }: { rows: BSDadosRow[] }) {
  if (!rows.length) return <Empty msg="Sem base BS & Dados para visão patrimonial." />;
  const sorted = [...rows].sort((a, b) => a.mesKey.localeCompare(b.mesKey));

  const handleExport = () => {
    const header = ["Conta", ...sorted.map(r => r.mes)];
    const body = PAT_ROWS.map(([label, field]) => [label, ...sorted.map(r => patValue(r, field))]);
    downloadCSV("auditoria-patrimonial.csv", [header, ...body]);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end"><ExportButton onClick={handleExport} /></div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-xs tabular-nums">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Conta</th>
              <th className="px-3 py-2 text-center font-semibold print:hidden">Tend.</th>
              {sorted.map(r => <th key={r.mesKey} className="px-3 py-2 text-right font-semibold">{r.mes}</th>)}
            </tr>
          </thead>
          <tbody>
            {PAT_ROWS.map(([label, field, bold]) => {
              const vals = sorted.map(r => patValue(r, field));
              return (
                <tr key={field} className={`border-b last:border-0 hover:bg-muted/20 ${bold ? "font-semibold" : ""}`}>
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-2 py-1 text-center print:hidden"><Sparkline values={vals} /></td>
                  {vals.map((v, i) => (
                    <td key={sorted[i].mesKey} className="px-3 py-2 text-right">{fmtBR(v)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────── Risco RJ ─────────────── */
function PanelRiscoRJ({ rows }: { rows: BSDadosRow[] }) {
  const kanitz = useMemo(() => buildKanitzMonthlySeries(rows), [rows]);
  const isg = useMemo(() => buildISGSeries(rows), [rows]);
  const summary = useMemo(() => summarizeKanitzSeries(kanitz), [kanitz]);
  if (!kanitz.length) return <Empty msg="Sem base BS & Dados para compor o Risco RJ." />;

  const lastK = kanitz[kanitz.length - 1];
  const lastI = isg[isg.length - 1];
  const kNorm = Math.max(0, Math.min(100, ((7 - (lastK?.score ?? 0)) / 10) * 100));
  const iNorm = Math.max(0, Math.min(100, ((2 - (lastI?.isg ?? 0)) / 2) * 100));
  const score = Math.round(kNorm * 0.6 + iNorm * 0.4);
  const band =
    score >= 67 ? { label: "Risco Crítico",  color: "hsl(0,84%,55%)"  } :
    score >= 33 ? { label: "Risco Moderado", color: "hsl(38,92%,50%)" } :
                  { label: "Risco Baixo",    color: "hsl(142,76%,36%)" };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score BEx-RJ</div>
          <div className="mt-2 text-3xl font-bold" style={{ color: band.color }}>{score}</div>
          <div className="mt-1 text-xs font-medium" style={{ color: band.color }}>{band.label}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kanitz (último mês)</div>
          <div className="mt-2 text-2xl font-bold">{fmt(lastK?.score, 4)}</div>
          <div className="mt-1 text-xs" style={{ color: lastK?.color }}>{lastK?.ratingLabel}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ISG (último mês)</div>
          <div className="mt-2 text-2xl font-bold">{fmt(lastI?.isg, 2)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{lastI?.icon} {lastI?.label}</div>
        </div>
      </div>
      <div className="rounded-lg border bg-white p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">Memória de cálculo</p>
        <p>Score = 0,6 × KanitzNorm + 0,4 × ISGNorm · KanitzNorm = ((7 − Kanitz) / 10) × 100 · ISGNorm = ((2 − ISG) / 2) × 100.</p>
        <p className="mt-1">Faixas: 0–32 Baixo · 33–66 Moderado · 67–100 Crítico. Tendência da janela: <b>Δ {fmt(summary?.delta, 4)}</b>.</p>
      </div>
    </div>
  );
}

/* Relatório Final foi movido para a aba "Relatório Prospecção Final" do workspace. */

/* ═══════════════════ Card raiz ═══════════════════ */
export default function AuditoriaCard({ companyId, runToken, bsParsed, bsEntries, prospecçãoId, loading }: AuditoriaCardProps) {
  const [params, setParams] = useSearchParams();
  const storageKey = `auditoria-tab:${prospecçãoId ?? "global"}`;
  const periodStorageKey = `auditoria-period:${prospecçãoId ?? "global"}`;

  // Aba inicial: URL > localStorage > "indicadores"
  const initial = useMemo<TabKey>(() => {
    const fromUrl = params.get("atab") as TabKey | null;
    if (fromUrl && TABS.some(t => t.key === fromUrl)) return fromUrl;
    try {
      const stored = localStorage.getItem(storageKey) as TabKey | null;
      if (stored && TABS.some(t => t.key === stored)) return stored;
    } catch { /* ignore */ }
    return "indicadores";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<TabKey>(initial);

  // BSDados completo (sem filtro) e meses disponíveis
  const allRows = useMemo(() => buildBSDados(bsParsed ?? null, bsEntries ?? []), [bsParsed, bsEntries]);
  const monthKeys = useMemo(
    () => Array.from(new Set(allRows.map(r => r.mesKey))).sort(),
    [allRows]
  );

  // Filtro de período (de / até) — restaura do localStorage por Prospecção
  const initialPeriod = useMemo<{ from: string; to: string }>(() => {
    try {
      const raw = localStorage.getItem(periodStorageKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p.from === "string" && typeof p.to === "string") return p;
      }
    } catch { /* ignore */ }
    return { from: "__all", to: "__all" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [from, setFrom] = useState<string>(initialPeriod.from);
  const [to, setTo] = useState<string>(initialPeriod.to);

  // Quando muda a base, reseta filtros se ficaram fora do range
  useEffect(() => {
    if (from !== "__all" && !monthKeys.includes(from)) setFrom("__all");
    if (to !== "__all" && !monthKeys.includes(to)) setTo("__all");
  }, [monthKeys, from, to]);

  // Persistência do período por Prospecção
  useEffect(() => {
    try { localStorage.setItem(periodStorageKey, JSON.stringify({ from, to })); } catch { /* ignore */ }
  }, [from, to, periodStorageKey]);

  const rows = useMemo(() => {
    if (from === "__all" && to === "__all") return allRows;
    const lo = from === "__all" ? monthKeys[0] : from;
    const hi = to === "__all" ? monthKeys[monthKeys.length - 1] : to;
    const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
    return allRows.filter(r => r.mesKey >= a && r.mesKey <= b);
  }, [allRows, from, to, monthKeys]);

  // KPIs do header (baseados no recorte filtrado)
  const kpi = useMemo(() => {
    const meses = rows.length;
    const errors = rows.flatMap(r => r.errors || []).length;
    const okEq = rows.filter(r => r.equilibrio_ok).length;
    const okPct = meses > 0 ? Math.round((okEq / meses) * 100) : 0;
    return { meses, errors, okEq, okPct };
  }, [rows]);

  const hasData = allRows.length > 0 || !!bsParsed;
  const filterActive = from !== "__all" || to !== "__all";

  // Sincroniza tab → URL + localStorage
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (tab === "indicadores") next.delete("atab");
    else next.set("atab", tab);
    setParams(next, { replace: true });
    try { localStorage.setItem(storageKey, tab); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const tabBadge: Partial<Record<TabKey, string>> = {
    indicadores: kpi.meses ? String(kpi.meses) : "",
    patrimonial: kpi.meses ? String(kpi.meses) : "",
    bsdados: kpi.errors ? String(kpi.errors) : "",
  };

  const formatMonthLabel = (mk: string) => {
    const found = allRows.find(r => r.mesKey === mk);
    return found?.mes ?? mk;
  };

  /** Aplica um atalho de período baseado nos meses disponíveis. */
  const applyQuickPeriod = (mode: "3m" | "6m" | "12m" | "ytd" | "all") => {
    if (!monthKeys.length) return;
    if (mode === "all") { setFrom("__all"); setTo("__all"); return; }
    const last = monthKeys[monthKeys.length - 1];
    setTo(last);
    if (mode === "ytd") {
      const year = last.slice(0, 4);
      const ytdStart = monthKeys.find(k => k.startsWith(year)) ?? last;
      setFrom(ytdStart);
      return;
    }
    const n = mode === "3m" ? 3 : mode === "6m" ? 6 : 12;
    const startIdx = Math.max(0, monthKeys.length - n);
    setFrom(monthKeys[startIdx]);
  };

  /** Export XLSX consolidado (multi-aba). */
  const handleExportXLSX = () => {
    const series = buildIndicatorSeries(rows);
    const keys = Object.keys(series).sort();
    if (!keys.length) return;
    const wb = XLSX.utils.book_new();

    const indHeader = ["Indicador", ...keys.map(k => series[k].mes)];
    const indBody = IND_ROWS.map(([label, field]) => [label, ...keys.map(k => (series[k] as any)[field] ?? "")]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([indHeader, ...indBody]), "Indicadores");

    const endHeader = ["Métrica", ...keys.map(k => series[k].mes)];
    const endBody = END_ROWS.map(([label, field]) => [label, ...keys.map(k => (series[k] as any)[field] ?? "")]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([endHeader, ...endBody]), "Endividamento");

    const sortedPat = [...rows].sort((a, b) => a.mesKey.localeCompare(b.mesKey));
    const patHeader = ["Conta", ...sortedPat.map(r => r.mes)];
    const patBody = PAT_ROWS.map(([label, field]) => [label, ...sortedPat.map(r => patValue(r, field))]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([patHeader, ...patBody]), "Patrimonial");

    const tag = prospecçãoId ? `prospecção-${prospecçãoId.slice(0, 8)}` : "auditoria";
    XLSX.writeFile(wb, `auditoria-${tag}.xlsx`);
  };

  /** Imprime/PDF apenas a região do card de Auditoria. */
  const handlePrint = () => {
    document.body.classList.add("auditoria-printing");
    const cleanup = () => {
      document.body.classList.remove("auditoria-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(() => window.print(), 50);
  };

  /** Alertas automáticos baseados no recorte filtrado. */
  const alerts = useMemo(() => {
    if (!rows.length) return [] as { level: "warn" | "crit"; msg: string }[];
    const out: { level: "warn" | "crit"; msg: string }[] = [];
    const last = [...rows].sort((a, b) => a.mesKey.localeCompare(b.mesKey)).pop()!;
    const series = buildIndicatorSeries(rows);
    const lastSerie = series[last.mesKey] as any;
    if (lastSerie && Number.isFinite(lastSerie.liquidezCorrente) && lastSerie.liquidezCorrente < 1) {
      out.push({ level: "crit", msg: `Liquidez Corrente abaixo de 1,00 em ${last.mes} (${fmt(lastSerie.liquidezCorrente)}).` });
    }
    if ((last.patrimonio_liquido ?? 0) < 0) {
      out.push({ level: "crit", msg: `Patrimônio Líquido negativo em ${last.mes} (${fmtBR(last.patrimonio_liquido)}).` });
    }
    const brokenEq = rows.filter(r => !r.equilibrio_ok).length;
    if (brokenEq > 0) {
      out.push({ level: "warn", msg: `${brokenEq} mês(es) com equilíbrio contábil quebrado (AT ≠ P + PL).` });
    }
    const kanitzSeries = buildKanitzMonthlySeries(rows);
    const lastK = kanitzSeries[kanitzSeries.length - 1];
    if (lastK && Number.isFinite(lastK.score) && lastK.score < 0) {
      out.push({ level: "crit", msg: `Kanitz em zona de insolvência (${fmt(lastK.score, 2)}) em ${lastK.mes ?? last.mes}.` });
    }
    if (lastSerie && Number.isFinite(lastSerie.endividamentoGeral) && lastSerie.endividamentoGeral > 0.8) {
      out.push({ level: "warn", msg: `Endividamento Geral elevado em ${last.mes} (${fmtPct(lastSerie.endividamentoGeral)}).` });
    }
    if (lastSerie && Number.isFinite(lastSerie.margemLiquida) && lastSerie.margemLiquida < 0) {
      out.push({ level: "warn", msg: `Margem Líquida negativa em ${last.mes} (${fmtPct(lastSerie.margemLiquida)}).` });
    }
    return out;
  }, [rows]);

  return (
    <>
      <style>{`
        @media print {
          body.auditoria-printing > :not(#auditoria-print-region) { display: none !important; }
          body.auditoria-printing #auditoria-print-region,
          body.auditoria-printing #auditoria-print-region * { visibility: visible !important; }
          body.auditoria-printing #auditoria-print-region { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
          body.auditoria-printing .print\\:hidden { display: none !important; }
        }
      `}</style>
      <Card id="auditoria-print-region" className="border-[hsl(217,91%,50%)]/30">

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-[hsl(217,91%,50%)]" />
              Auditoria
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Visões de auditoria carregadas dos MDs e do pipeline processado — gestão centralizada do Prospecção.
            </p>
          </div>
          {hasData && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="gap-1">
                <Calendar className="h-3 w-3" /> {kpi.meses} {kpi.meses === 1 ? "mês" : "meses"}
              </Badge>
              <Badge
                variant="outline"
                className="gap-1"
                style={{
                  color: kpi.okPct >= 67 ? "hsl(142,76%,36%)" : kpi.okPct >= 33 ? "hsl(38,92%,50%)" : "hsl(0,84%,55%)",
                  borderColor: "currentColor",
                }}
              >
                {kpi.okPct >= 67 ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                Equilíbrio {kpi.okPct}%
              </Badge>
              {kpi.errors > 0 && (
                <Badge variant="outline" className="gap-1 text-[hsl(0,84%,55%)] border-[hsl(0,84%,55%)]/40">
                  <AlertTriangle className="h-3 w-3" /> {kpi.errors} erro(s)
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={handleExportXLSX} className="h-7 gap-1.5 text-xs print:hidden" disabled={!rows.length}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Export XLSX
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint} className="h-7 gap-1.5 text-xs print:hidden">
                <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alertas automáticos */}
        {hasData && alerts.length > 0 && (
          <div className="rounded-lg border border-[hsl(0,84%,55%)]/30 bg-[hsl(0,84%,55%)]/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[hsl(0,84%,55%)]">
              <AlertCircle className="h-3.5 w-3.5" />
              {alerts.length} alerta{alerts.length > 1 ? "s" : ""} detectado{alerts.length > 1 ? "s" : ""}
            </div>
            <ul className="space-y-1 text-xs text-foreground">
              {alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span
                    className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: a.level === "crit" ? "hsl(0,84%,55%)" : "hsl(38,92%,50%)" }}
                  />
                  <span>{a.msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filtro de período + atalhos rápidos */}
        {monthKeys.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
            <span className="font-semibold text-muted-foreground">Período:</span>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="De" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Início</SelectItem>
                {monthKeys.map(k => <SelectItem key={k} value={k}>{formatMonthLabel(k)}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">até</span>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger className="h-7 w-[160px] text-xs"><SelectValue placeholder="Até" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Fim</SelectItem>
                {monthKeys.map(k => <SelectItem key={k} value={k}>{formatMonthLabel(k)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="mx-1 h-4 w-px bg-border" />
            {(["3m", "6m", "12m", "ytd", "all"] as const).map(p => (
              <Button
                key={p}
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] font-semibold text-muted-foreground hover:bg-[hsl(217,91%,50%)]/10 hover:text-[hsl(217,91%,50%)]"
                onClick={() => applyQuickPeriod(p)}
              >
                {p === "ytd" ? "YTD" : p === "all" ? "Tudo" : `Últ. ${p}`}
              </Button>
            ))}
            {filterActive && (
              <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => { setFrom("__all"); setTo("__all"); }}>
                Limpar
              </Button>
            )}
          </div>
        )}

        {/* Menu inline */}
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 border-b border-border bg-white/95 px-1 pb-1 backdrop-blur">
          {TABS.map(t => {
            const active = tab === t.key;
            const badge = tabBadge[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[hsl(217,91%,50%)] text-white"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {t.label}
                {badge && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-muted text-foreground/70"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!hasData ? (
          loading
            ? <Empty msg="Carregando dados consolidados do balancete..." />
            : <Empty msg="Aguardando processamento do balancete para habilitar as visões de auditoria." />
        ) : (
          <div>
            {tab === "indicadores"   && <PanelIndicadores rows={rows} />}
            {tab === "endividamento" && <PanelEndividamento rows={rows} />}
            {tab === "patrimonial"   && <PanelPatrimonial rows={rows} />}
            {tab === "bsdados"       && <TabBSDados parsedData={bsParsed} entries={bsEntries} companyId={companyId} runToken={runToken} />}
            {tab === "pivot"         && <TabPivotConsolidado companyId={companyId} runToken={runToken} fallbackRows={rows} />}
            {tab === "graficos"      && <TabGraficosAuditoria parsedData={bsParsed} entries={bsEntries} />}
            {tab === "riscorj"       && <PanelRiscoRJ rows={rows} />}
            {tab === "kanitz"        && <TabKanitz parsedData={bsParsed} />}
            
          </div>
        )}
      </CardContent>
      </Card>
    </>
  );
}
