// ============================================================
// TabPivotConsolidado — Visão pivot código × mês a partir de
// balancete_consolidado (auditoria folha-a-folha estilo XLSX).
// Consome fetchPivotConsolidado e exibe totais por classificação.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GitMerge, AlertTriangle, CheckCircle2, Loader2, Search, X } from "lucide-react";
import {
  fetchPivotConsolidado,
  type PivotConsolidadoResult,
} from "@/services/bsDados/pivotConsolidado";
import type { BSDadosRow } from "@/services/bsDadosBuilder";

const fmt = (v?: number | null) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Number(v);
  if (n === 0) return "—";
  const s = Math.abs(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
  return n < 0 ? `(${s})` : s;
};

const fmtPct = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;

const labelMes = (mk: string) => {
  const [y, m] = mk.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[Number(m) - 1] || m}/${y.slice(2)}`;
};

const tipoBadge: Record<string, string> = {
  ativo: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  passivo: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  patrimonio_liquido: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  receita: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  despesa: "bg-red-500/15 text-red-700 border-red-500/30",
};

interface Props {
  companyId: string | null;
  runToken?: string;
  fallbackRows?: BSDadosRow[];
}

const pivotFromBSDados = (source: BSDadosRow[]): PivotConsolidadoResult => {
  const mesKeys = source.map((r) => r.mesKey).sort();
  const labels: Array<[string, keyof BSDadosRow, string]> = [
    ["Receita Líquida", "receita_liquida", "receita"], ["CMV", "cmv", "despesa"], ["Despesas", "despesas", "despesa"],
    ["Ativo Circulante", "ativo_circulante", "ativo"], ["Ativo Não Circulante", "ativo_nao_circulante", "ativo"],
    ["Passivo Circulante", "passivo_circulante", "passivo"], ["Passivo Não Circulante", "passivo_nao_circulante", "passivo"],
    ["Patrimônio Líquido", "patrimonio_liquido", "patrimonio_liquido"], ["Estoques", "estoques", "ativo"],
    ["Disponível", "disponivel", "ativo"], ["Dívida Total", "divida_total", "passivo"],
  ];
  const rows = labels.map(([descricao, field, tipo], index) => ({
    codigo: String(index + 1).padStart(2, "0"), conta: descricao, descricao, tipo, grupo: null, subgrupo: null,
    values: Object.fromEntries(source.map((r) => [r.mesKey, Number(r[field]) || 0])),
  }));
  const equilibrio = source.map((r) => ({
    mesKey: r.mesKey, ativo: r.ativo_total || 0, passivo: r.passivo_total || 0,
    patrimonio_liquido: r.patrimonio_liquido || 0, diff: r.equilibrio_diff || 0,
    diff_pct: r.equilibrio_diff_pct || 0, ok: !!r.equilibrio_ok,
  }));
  return { rows, mesKeys, equilibrio };
};

const TabPivotConsolidado = ({ companyId, runToken, fallbackRows = [] }: Props) => {
  const [data, setData] = useState<PivotConsolidadoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true); setErr(null);
    fetchPivotConsolidado(companyId)
      .then(r => { if (!cancelled) setData(r.rows.length ? r : pivotFromBSDados(fallbackRows)); })
      .catch(e => { if (!cancelled) setErr(e?.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, runToken, fallbackRows]);

  // Totais por classificação × mês
  const totais = useMemo(() => {
    if (!data) return null;
    const acc: Record<string, Record<string, number>> = {
      ativo: {}, passivo: {}, patrimonio_liquido: {}, receita: {}, despesa: {},
    };
    for (const r of data.rows) {
      const c = r.codigo || "";
      let cls: string | null = null;
      if (c.startsWith("1") || r.tipo === "ativo") cls = "ativo";
      else if (c.startsWith("2") || r.tipo === "passivo") cls = "passivo";
      else if (c.startsWith("3") || r.tipo === "patrimonio_liquido") cls = "patrimonio_liquido";
      else if (c.startsWith("4") || r.tipo === "receita") cls = "receita";
      else if (c.startsWith("5") || r.tipo === "despesa") cls = "despesa";
      if (!cls) continue;
      for (const mk of data.mesKeys) {
        const v = Number(r.values[mk] || 0);
        if (!v) continue;
        acc[cls][mk] = (acc[cls][mk] || 0) + (cls === "ativo" || cls === "passivo" ? Math.abs(v) : v);
      }
    }
    return acc;
  }, [data]);

  if (!companyId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Selecione um Prospeccao real para visualizar o pivot consolidado.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando pivot consolidado…
        </CardContent>
      </Card>
    );
  }

  if (err) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="py-6 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> {err}
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.rows.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <GitMerge className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">
            Nenhum dado em <code>balancete_consolidado</code>. Execute o pipeline na aba <b>Balancete</b>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { rows, mesKeys, equilibrio } = data;
  const desbalanceados = equilibrio.filter(e => !e.ok && (e.ativo || e.passivo || e.patrimonio_liquido));

  return (
    <div className="space-y-4">
      {/* Validação Ativo = Passivo + PL */}
      <Card className={desbalanceados.length ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"}>
        <CardContent className="py-3 flex items-start gap-3">
          {desbalanceados.length ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          )}
          <div className="text-xs">
            <p className="font-semibold mb-1">
              {desbalanceados.length
                ? `Balanço desequilibrado em ${desbalanceados.length} mês${desbalanceados.length > 1 ? "es" : ""} (tolerância 0,5%)`
                : `Balanço equilibrado em todos os ${equilibrio.length} meses (Ativo = Passivo + PL, tolerância 0,5%)`}
            </p>
            {desbalanceados.length > 0 && (
              <ul className="space-y-0.5 text-amber-700">
                {desbalanceados.slice(0, 6).map(e => (
                  <li key={e.mesKey}>
                    <b>{labelMes(e.mesKey)}</b>: A = {fmt(e.ativo)} · P+PL = {fmt(e.passivo + e.patrimonio_liquido)} ·
                    Δ = {fmt(e.diff)} ({fmtPct(e.diff_pct)})
                  </li>
                ))}
                {desbalanceados.length > 6 && <li>… +{desbalanceados.length - 6}</li>}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totais por classificação */}
      {totais && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Totais por Classificação × Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b-2 text-muted-foreground">
                    <th className="text-left py-2 px-2 font-semibold sticky left-0 bg-background">Classificação</th>
                    {mesKeys.map(mk => (
                      <th key={mk} className="text-right px-2 font-semibold whitespace-nowrap">{labelMes(mk)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["ativo", "passivo", "patrimonio_liquido", "receita", "despesa"] as const).map(cls => (
                    <tr key={cls} className="border-b border-border/20 hover:bg-muted/30">
                      <td className="py-1.5 px-2 sticky left-0 bg-background">
                        <Badge variant="outline" className={tipoBadge[cls]}>
                          {cls === "patrimonio_liquido" ? "Patrim. Líquido" : cls.charAt(0).toUpperCase() + cls.slice(1)}
                        </Badge>
                      </td>
                      {mesKeys.map(mk => (
                        <td key={mk} className="text-right px-2">{fmt(totais[cls][mk])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pivot folha-a-folha */}
      <PivotTable rows={rows} mesKeys={mesKeys} />
    </div>
  );
};

// ───────────────────────── Pivot table com filtros ─────────────────────────
const CLASSES = [
  { key: "all", label: "Todos" },
  { key: "ativo", label: "Ativo" },
  { key: "passivo", label: "Passivo" },
  { key: "patrimonio_liquido", label: "PL" },
  { key: "receita", label: "Receita" },
  { key: "despesa", label: "Despesa" },
] as const;
type ClsKey = typeof CLASSES[number]["key"];

function classifyRow(codigo: string | null, tipo: string | null): ClsKey | null {
  const c = codigo || "";
  if (c.startsWith("1") || tipo === "ativo") return "ativo";
  if (c.startsWith("2") || tipo === "passivo") return "passivo";
  if (c.startsWith("3") || tipo === "patrimonio_liquido") return "patrimonio_liquido";
  if (c.startsWith("4") || tipo === "receita") return "receita";
  if (c.startsWith("5") || tipo === "despesa") return "despesa";
  return null;
}

interface PivotTableProps {
  rows: PivotConsolidadoResult["rows"];
  mesKeys: string[];
}

const ROW_HEIGHT = 30; // px — altura aproximada de cada linha (py-1.5 + text-xs)
const VIEWPORT_HEIGHT = 600; // px — altura do scroll container
const OVERSCAN = 8; // linhas extra acima/abaixo do viewport

const PivotTable = ({ rows, mesKeys }: PivotTableProps) => {
  const [cls, setCls] = useState<ClsKey>("all");
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (cls !== "all") {
        const rc = classifyRow(r.codigo, r.tipo);
        if (rc !== cls) return false;
      }
      if (!q) return true;
      const codigo = (r.codigo || "").toLowerCase();
      const conta = (r.conta || "").toLowerCase();
      const desc = (r.descricao || "").toLowerCase();
      return codigo.includes(q) || conta.includes(q) || desc.includes(q);
    });
  }, [rows, cls, query]);

  // Reset scroll quando filtro muda
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [cls, query]);

  // Janela visível
  const total = filtered.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(total, startIdx + visibleCount);
  const visible = filtered.slice(startIdx, endIdx);
  const padTop = startIdx * ROW_HEIGHT;
  const padBottom = Math.max(0, (total - endIdx) * ROW_HEIGHT);
  const colCount = 3 + mesKeys.length;

  return (
    <Card className="border-[hsl(258,90%,66%)]/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-[hsl(258,90%,66%)]" />
              Pivot Consolidado — Código × Mês
              <span className="text-xs text-muted-foreground font-normal">
                (auditoria folha-a-folha)
              </span>
            </CardTitle>
            <Badge variant="outline">
              {filtered.length} de {rows.length} contas · {mesKeys.length} meses
            </Badge>
          </div>

          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por código, conta ou descrição…"
                className="h-8 pl-7 pr-7 text-xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {CLASSES.map(c => (
                <Button
                  key={c.key}
                  type="button"
                  size="sm"
                  variant={cls === c.key ? "default" : "outline"}
                  onClick={() => setCls(c.key)}
                  className="h-8 text-xs px-2.5"
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
          className="overflow-auto"
          style={{ maxHeight: VIEWPORT_HEIGHT, willChange: "transform" }}
        >
          <table className="w-full text-xs tabular-nums" style={{ tableLayout: "fixed" }}>
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b-2 text-muted-foreground">
                <th className="text-left py-2 px-2 font-semibold sticky left-0 bg-background" style={{ width: 110 }}>Código</th>
                <th className="text-left py-2 px-2 font-semibold" style={{ width: 280 }}>Conta</th>
                <th className="text-left py-2 px-2 font-semibold" style={{ width: 110 }}>Tipo</th>
                {mesKeys.map(mk => (
                  <th key={mk} className="text-right px-2 font-semibold whitespace-nowrap" style={{ width: 90 }}>
                    {labelMes(mk)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-8 text-center text-muted-foreground">
                    Nenhuma conta corresponde aos filtros.
                  </td>
                </tr>
              ) : (
                <>
                  {padTop > 0 && (
                    <tr aria-hidden="true" style={{ height: padTop }}>
                      <td colSpan={colCount} style={{ padding: 0, border: 0 }} />
                    </tr>
                  )}
                  {visible.map((r, i) => {
                    const idx = startIdx + i;
                    return (
                      <tr
                        key={`${r.codigo || r.conta}-${idx}`}
                        className="border-b border-border/10 hover:bg-muted/30"
                        style={{ height: ROW_HEIGHT }}
                      >
                        <td className="px-2 font-mono text-[11px] sticky left-0 bg-background truncate">
                          {r.codigo || "—"}
                        </td>
                        <td className="px-2 truncate" title={r.descricao || r.conta}>
                          {r.descricao || r.conta}
                        </td>
                        <td className="px-2">
                          {r.tipo && (
                            <Badge variant="outline" className={`${tipoBadge[r.tipo] || ""} text-[10px]`}>
                              {r.tipo}
                            </Badge>
                          )}
                        </td>
                        {mesKeys.map(mk => (
                          <td key={mk} className="text-right px-2">{fmt(r.values[mk])}</td>
                        ))}
                      </tr>
                    );
                  })}
                  {padBottom > 0 && (
                    <tr aria-hidden="true" style={{ height: padBottom }}>
                      <td colSpan={colCount} style={{ padding: 0, border: 0 }} />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground text-right">
            Exibindo linhas {startIdx + 1}–{endIdx} de {total} (virtualização ativa)
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default TabPivotConsolidado;
