import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database, Download, AlertTriangle, CheckCircle2, GitMerge } from "lucide-react";
import {
  buildBSDados, computeBSIndicators, downloadBSDadosCSV,
} from "@/services/bsDados/bsDadosBuilder";
import type { ParsedFinancialData, BalanceteEntry } from "@/services/bsDados/types";
import TabPivotConsolidado from "./TabPivotConsolidado";
import BSDadosReferenciaCheck from "./BSDadosReferenciaCheck";

const fmt = (v?: number | null, dec = 0) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = Number(v);
  const s = Math.abs(n).toLocaleString("pt-BR", {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  });
  return n < 0 ? `(${s})` : s;
};
const fmtPct = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`;

const fmtDec = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(2).replace(".", ",");

interface TabBSDadosProps {
  parsedData: ParsedFinancialData | null;
  entries?: BalanceteEntry[];
  companyId?: string | null;
  runToken?: string;
}

const TabBSDados = ({ parsedData, entries = [], companyId = null, runToken }: TabBSDadosProps) => {
  const [view, setView] = useState<"dados" | "pivot">("dados");
  const rows = useMemo(() => buildBSDados(parsedData, entries), [parsedData, entries]);
  const errorCount = useMemo(() => rows.flatMap(r => r.errors).length, [rows]);
  const desbalanceados = useMemo(
    () => rows.filter(r => r.hasBalanco && r.patrimonio_liquido !== 0 && !r.equilibrio_ok),
    [rows],
  );

  const Switcher = (
    <div className="inline-flex rounded-lg border bg-muted/30 p-1 gap-1">
      <Button
        size="sm"
        variant={view === "dados" ? "default" : "ghost"}
        className={`h-8 gap-1.5 ${view === "dados" ? "bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white" : ""}`}
        onClick={() => setView("dados")}
      >
        <Database className="w-3.5 h-3.5" /> Dados Consolidados
      </Button>
      <Button
        size="sm"
        variant={view === "pivot" ? "default" : "ghost"}
        className={`h-8 gap-1.5 ${view === "pivot" ? "bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,60%)] text-white" : ""}`}
        onClick={() => setView("pivot")}
      >
        <GitMerge className="w-3.5 h-3.5" /> Pivot Consolidado
      </Button>
    </div>
  );

  if (view === "pivot") {
    return (
      <div className="space-y-4">
        {Switcher}
        <TabPivotConsolidado companyId={companyId} runToken={runToken} fallbackRows={rows} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="space-y-4">
        {Switcher}
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">
              Nenhum balancete consolidado ainda. Execute o pipeline na aba <b>Balancete</b> para popular esta visão.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Switcher}
      {/* Banner de validação contábil A = P + PL (tolerância 0,5%) */}
      {desbalanceados.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-amber-800 mb-1">
                Balanço desequilibrado em {desbalanceados.length} mês{desbalanceados.length > 1 ? "es" : ""} —
                tolerância contábil 0,5% (Ativo = Passivo + PL)
              </p>
              <ul className="space-y-0.5 text-amber-700">
                {desbalanceados.slice(0, 6).map(r => (
                  <li key={r.mesKey}>
                    <b>{r.mes}</b>: A = {fmt(r.ativo_total)} · P+PL = {fmt(r.passivo_total + r.patrimonio_liquido)} ·
                    Δ = {fmt(r.equilibrio_diff)} ({(r.equilibrio_diff_pct * 100).toFixed(2)}%)
                  </li>
                ))}
                {desbalanceados.length > 6 && <li>… +{desbalanceados.length - 6}</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <BSDadosReferenciaCheck rows={rows} />

      {/* Card principal */}
      <Card className="border-[hsl(258,90%,66%)]/20">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                BS &amp; Dados — Base Consolidada
                <span className="text-xs text-muted-foreground font-noprospecçãol">
                  (Single Source of Truth)
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Consolidação mensal por <b>Ref Capital</b>. Todos os gráficos e cálculos consomem desta tabela.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {errorCount === 0 ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Validado
                </Badge>
              ) : (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                  <AlertTriangle className="w-3 h-3 mr-1" /> {errorCount} alerta{errorCount > 1 ? "s" : ""}
                </Badge>
              )}
              <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => downloadBSDadosCSV(rows, `bs_dados_${new Date().toISOString().slice(0, 10)}.csv`)}>
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b-2 text-muted-foreground">
                  <th className="text-left py-2 px-2 font-semibold">Mês</th>
                  <th className="text-right px-2 font-semibold">Receita</th>
                  <th className="text-right px-2 font-semibold">CMV</th>
                  <th className="text-right px-2 font-semibold">Despesas</th>
                  <th className="text-right px-2 font-semibold">Resultado</th>
                  <th className="text-right px-2 font-semibold">AC</th>
                  <th className="text-right px-2 font-semibold">PC</th>
                  <th className="text-right px-2 font-semibold">Estoque</th>
                  <th className="text-right px-2 font-semibold">Disponível</th>
                  <th className="text-right px-2 font-semibold">Dívida Total</th>
                  <th className="text-right px-2 font-semibold">%CMV/RL</th>
                  <th className="text-right px-2 font-semibold">LC</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const ind = computeBSIndicators(r);
                  const hasErr = r.errors.length > 0;
                  return (
                    <tr
                      key={r.mesKey}
                      className={`border-b border-border/20 ${hasErr ? "bg-amber-500/5" : ""} hover:bg-muted/30`}
                      title={hasErr ? r.errors.join("\n") : undefined}
                    >
                      <td className="py-1.5 px-2 font-medium flex items-center gap-1">
                        {hasErr && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                        {r.mes}
                      </td>
                      <td className="text-right px-2">{fmt(r.receita_liquida)}</td>
                      <td className="text-right px-2 text-red-600">{fmt(r.cmv)}</td>
                      <td className="text-right px-2 text-red-600">{fmt(r.despesas)}</td>
                      <td className={`text-right px-2 font-semibold ${r.resultado < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {fmt(r.resultado)}
                      </td>
                      <td className="text-right px-2">{fmt(r.ativo_circulante)}</td>
                      <td className="text-right px-2">{fmt(r.passivo_circulante)}</td>
                      <td className="text-right px-2">{fmt(r.estoques)}</td>
                      <td className="text-right px-2">{fmt(r.disponivel)}</td>
                      <td className="text-right px-2">{fmt(r.divida_total)}</td>
                      <td className="text-right px-2">{fmtPct(ind.cmvPct)}</td>
                      <td className="text-right px-2">{fmtDec(ind.liquidez_corrente)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Card componentes da dívida */}
      <Card className="border-[hsl(258,90%,66%)]/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Componentes da Dívida (módulo, R$)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b-2 text-muted-foreground">
                  <th className="text-left py-2 px-2 font-semibold">Mês</th>
                  <th className="text-right px-2 font-semibold">Tributária</th>
                  <th className="text-right px-2 font-semibold">Trabalhista</th>
                  <th className="text-right px-2 font-semibold">Financeira</th>
                  <th className="text-right px-2 font-semibold">Fornecedores</th>
                  <th className="text-right px-2 font-semibold">Credores RJ</th>
                  <th className="text-right px-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.mesKey} className="border-b border-border/20 hover:bg-muted/30">
                    <td className="py-1.5 px-2 font-medium">{r.mes}</td>
                    <td className="text-right px-2">{fmt(r.divida_tributaria)}</td>
                    <td className="text-right px-2">{fmt(r.divida_trabalhista)}</td>
                    <td className="text-right px-2">{fmt(r.divida_financeira)}</td>
                    <td className="text-right px-2">{fmt(r.fornecedores)}</td>
                    <td className="text-right px-2">{fmt(r.credores_rj)}</td>
                    <td className="text-right px-2 font-semibold">{fmt(r.divida_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TabBSDados;
