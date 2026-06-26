import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen, Search, ChevronRight, ChevronDown, CheckCircle2, AlertTriangle, Download,
} from "lucide-react";
import dipRef from "@/data/dipBalanceteReferencia.json";

/**
 * Balancete (Referência DIP) — Single Source of Truth para validar
 * o pipeline IA → balancete. Mostra contas hierárquicas com saldos
 * mensais acumulados (Set/2025 → Mar/2026) classificados por:
 *   • Ref 2 (Ativo / Passivo / Resultado)
 *   • Ref 1 (classificação contábil detalhada — A, B, C1, AA, 30.A, …)
 *   • Nível hierárquico (1 → 1.1 → 1.1.01 → 1.1.01.001 → folha)
 */

type Row = {
  conta: string;
  descricao: string;
  set25: number | null; out25: number | null; nov25: number | null;
  dez25: number | null; jan26: number | null; fev26: number | null; mar26: number | null;
  ref1: string | null; ref2: string | null;
};

const PERIODOS = dipRef.periodos as readonly (keyof Row)[];
const LABELS = dipRef.periodosLabel as readonly string[];
const ROWS = dipRef.rows as Row[];

const fmt = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `(${s})` : s;
};

const level = (conta: string) => conta.split(".").length;

const tone = (ref2: string | null) => {
  if (ref2 === "Ativo") return "text-blue-700 dark:text-blue-300";
  if (ref2 === "Passivo") return "text-amber-700 dark:text-amber-300";
  if (ref2 === "Resultado") return "text-purple-700 dark:text-purple-300";
  return "text-foreground";
};

const TabBalanceteReferencia = () => {
  const [filtroRef2, setFiltroRef2] = useState<"todos" | "Ativo" | "Passivo" | "Resultado">("todos");
  const [busca, setBusca] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [maxLevel, setMaxLevel] = useState<number>(4);
  const [destaque, setDestaque] = useState<"nov25" | "dez25" | "jan26">("jan26");

  const filteredRows = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return ROWS.filter(r => {
      if (filtroRef2 !== "todos" && r.ref2 !== filtroRef2) return false;
      if (level(r.conta) > maxLevel) return false;
      if (term && !r.descricao.toLowerCase().includes(term) && !r.conta.includes(term) &&
          !(r.ref1 || "").toLowerCase().includes(term)) return false;
      // collapsed group hides children
      for (const grp of collapsedGroups) {
        if (r.conta !== grp && r.conta.startsWith(grp + ".")) return false;
      }
      return true;
    });
  }, [filtroRef2, busca, maxLevel, collapsedGroups]);

  // Totais por Ref2 no mês de destaque
  const totais = useMemo(() => {
    const acc = { Ativo: 0, Passivo: 0, Resultado: 0 };
    for (const r of ROWS) {
      if (level(r.conta) !== 1) continue;
      const v = (r[destaque] as number | null) ?? 0;
      if (r.ref2 === "Ativo") acc.Ativo += v;
      else if (r.ref2 === "Passivo") acc.Passivo += v;
      else if (r.ref2 === "Resultado") acc.Resultado += v;
    }
    return acc;
  }, [destaque]);

  const totalRows = filteredRows.length;
  const totalContas = ROWS.length;
  const equilibrio = Math.abs(totais.Ativo - totais.Passivo);
  const equilibrioPct = totais.Ativo > 0 ? equilibrio / totais.Ativo : 0;
  const equilibrado = equilibrioPct < 0.005;

  const toggleGroup = (conta: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(conta) ? next.delete(conta) : next.add(conta);
      return next;
    });

  const exportCSV = () => {
    const head = ["Conta", "Descrição", ...LABELS, "Ref 1", "Ref 2"].join(";");
    const body = filteredRows.map(r =>
      [r.conta, `"${r.descricao}"`, ...PERIODOS.map(p => (r[p] ?? "")), r.ref1 ?? "", r.ref2 ?? ""].join(";")
    ).join("\n");
    const blob = new Blob([`\ufeff${head}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `balancete_referencia_DIP_${destaque}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Header / KPIs */}
      <Card className="border-emerald-500/30">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              Balancete de Referência — DIP (Set/2025 → Mar/2026)
              <Badge variant="outline" className="text-[10px]">Single Source of Truth</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {equilibrado ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> A = P (Δ {fmt(equilibrio)})
                </Badge>
              ) : (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Δ {fmt(equilibrio)} ({(equilibrioPct * 100).toFixed(2)}%)
                </Badge>
              )}
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={exportCSV}>
                <Download className="w-3 h-3" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded border bg-blue-500/5 border-blue-500/20">
              <p className="text-muted-foreground text-[10px]">Ativo Total ({LABELS[PERIODOS.indexOf(destaque)]})</p>
              <p className="font-bold text-blue-700">{fmt(totais.Ativo)}</p>
            </div>
            <div className="p-2 rounded border bg-amber-500/5 border-amber-500/20">
              <p className="text-muted-foreground text-[10px]">Passivo Total + PL</p>
              <p className="font-bold text-amber-700">{fmt(totais.Passivo)}</p>
            </div>
            <div className="p-2 rounded border bg-purple-500/5 border-purple-500/20">
              <p className="text-muted-foreground text-[10px]">Resultado</p>
              <p className="font-bold text-purple-700">{fmt(totais.Resultado)}</p>
            </div>
            <div className="p-2 rounded border bg-muted/30">
              <p className="text-muted-foreground text-[10px]">Contas exibidas</p>
              <p className="font-bold">{totalRows} / {totalContas}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controles */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por conta, descrição ou Ref 1 (ex.: 30.A, AA, Caixa)…"
                className="h-8 pl-7 text-xs" />
            </div>
            <div className="inline-flex rounded border bg-muted/30 p-0.5 gap-0.5">
              {(["todos", "Ativo", "Passivo", "Resultado"] as const).map(r => (
                <Button key={r} size="sm" variant={filtroRef2 === r ? "default" : "ghost"}
                  className="h-7 px-2 text-[11px] capitalize" onClick={() => setFiltroRef2(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <div className="inline-flex rounded border bg-muted/30 p-0.5 gap-0.5">
              <span className="px-2 text-[10px] text-muted-foreground self-center">Nível</span>
              {[1, 2, 3, 4, 5].map(l => (
                <Button key={l} size="sm" variant={maxLevel === l ? "default" : "ghost"}
                  className="h-7 px-2 text-[11px]" onClick={() => setMaxLevel(l)}>{l}</Button>
              ))}
            </div>
            <div className="inline-flex rounded border bg-muted/30 p-0.5 gap-0.5">
              {(["nov25", "dez25", "jan26"] as const).map(p => (
                <Button key={p} size="sm" variant={destaque === p ? "default" : "ghost"}
                  className="h-7 px-2 text-[11px]" onClick={() => setDestaque(p)}>
                  {LABELS[PERIODOS.indexOf(p)]}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela hierárquica */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead className="bg-muted/40 border-b-2">
                <tr className="text-muted-foreground">
                  <th className="text-left py-2 px-2 font-semibold w-[110px]">Conta</th>
                  <th className="text-left px-2 font-semibold min-w-[260px]">Descrição</th>
                  {LABELS.map((l, i) => (
                    <th key={i} className={`text-right px-2 font-semibold ${PERIODOS[i] === destaque ? "bg-primary/10" : ""}`}>{l}</th>
                  ))}
                  <th className="text-center px-2 font-semibold w-[60px]">Ref1</th>
                  <th className="text-center px-2 font-semibold w-[80px]">Ref2</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => {
                  const lv = level(r.conta);
                  const isGroup = lv < 5;
                  const collapsed = collapsedGroups.has(r.conta);
                  const fontWeight = lv === 1 ? "font-bold" : lv === 2 ? "font-semibold" : lv === 3 ? "font-medium" : "";
                  const bg = lv === 1 ? "bg-muted/40" : lv === 2 ? "bg-muted/20" : "";
                  return (
                    <tr key={r.conta} className={`border-b border-border/20 hover:bg-muted/30 ${bg}`}>
                      <td className={`py-1 px-2 ${fontWeight} ${tone(r.ref2)}`}>
                        <span className="font-mono">{r.conta}</span>
                      </td>
                      <td className={`px-2 ${fontWeight} ${tone(r.ref2)}`}>
                        <span style={{ paddingLeft: `${(lv - 1) * 12}px` }} className="inline-flex items-center gap-1">
                          {isGroup ? (
                            <button onClick={() => toggleGroup(r.conta)} className="text-muted-foreground hover:text-foreground">
                              {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          ) : <span className="w-3" />}
                          {r.descricao}
                        </span>
                      </td>
                      {PERIODOS.map(p => (
                        <td key={p} className={`text-right px-2 ${fontWeight} ${PERIODOS.indexOf(p) === PERIODOS.indexOf(destaque) ? "bg-primary/5" : ""}`}>
                          {fmt(r[p] as number | null)}
                        </td>
                      ))}
                      <td className="text-center px-2">
                        {r.ref1 && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{r.ref1}</Badge>}
                      </td>
                      <td className="text-center px-2">
                        {r.ref2 && <Badge className={`text-[9px] px-1 py-0 h-4 ${
                          r.ref2 === "Ativo" ? "bg-blue-500/15 text-blue-700 border-blue-500/30" :
                          r.ref2 === "Passivo" ? "bg-amber-500/15 text-amber-700 border-amber-500/30" :
                          "bg-purple-500/15 text-purple-700 border-purple-500/30"
                        }`} variant="outline">{r.ref2}</Badge>}
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-8 text-muted-foreground text-xs">
                    Nenhuma conta encontrada com os filtros atuais.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground px-1">
        Fonte: balancete DIP <b>setembro/2025 a março/2026 v2</b>. Esta visão é usada como referência
        para validar a extração IA (OneDrive → OCR → parser → balancete consolidado). Os meses
        acumulam saldos: o saldo de janeiro/2026 reflete novembro + dezembro + janeiro.
      </p>
    </div>
  );
};

export default TabBalanceteReferencia;
