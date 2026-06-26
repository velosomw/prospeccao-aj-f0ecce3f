import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, Download, FileBarChart2 } from "lucide-react";
import refData from "@/data/dipEndividamentoReferencia.json";

type MesRef = (typeof refData.meses)[number];

const fmt = (n?: number | null, dec = 2) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPct = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `${(n * 100).toFixed(2).replace(".", ",")}%`;
const fmtDec = (n?: number | null, dec = 3) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(dec).replace(".", ",");

/** Recompute indicators from raw values to validate report formulas */
function recompute(m: MesRef) {
  const { ativo_total: AT, ativo_circulante: AC, passivo_total: PT, passivo_circulante: PC, passivo_nao_circulante: PNC, patrimonio_liquido: PL } = m.resumo;
  return {
    liquidez_corrente: PC ? AC / PC : null,
    endividamento_geral: AT ? PT / AT : null,
    endividamento_curto_prazo: AT ? PC / AT : null,
    endividamento_longo_prazo: AT ? PNC / AT : null,
    composicao_endividamento: PT ? PC / PT : null,
    capital_terceiros: PT + PL ? PT / (PT + PL) : null,
    imobilizacao_pl: PL ? (AT - AC) / PL : null,
    equilibrio_diff: AT - (PT + PL),
    pc_pnc_sum: PC + PNC,
    pt_minus_components: PT - (PC + PNC),
  };
}

const TOL_ABS = 0.005; // 0,5pp absolute tolerance for ratios
const TOL_REL = 0.005; // 0,5% relative tolerance for nominal values

function deltaBadge(stated: number | null | undefined, computed: number | null | undefined, kind: "ratio" | "value" = "ratio") {
  if (stated == null || computed == null || !Number.isFinite(stated) || !Number.isFinite(computed)) {
    return <Badge variant="outline" className="text-[10px]">n/d</Badge>;
  }
  const diff = Math.abs(stated - computed);
  const ok = kind === "ratio" ? diff <= TOL_ABS : diff <= Math.abs(stated) * TOL_REL;
  return ok ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" />Δ {kind === "ratio" ? fmtPct(diff) : fmt(diff)}</Badge>
  );
}

const INDICADOR_LABELS: { key: keyof MesRef["indicadores"]; label: string; formula: string; type: "ratio" }[] = [
  { key: "liquidez_corrente",       label: "Liquidez Corrente",        formula: "AC ÷ PC",        type: "ratio" },
  { key: "endividamento_geral",     label: "Endividamento Geral",      formula: "PT ÷ AT",        type: "ratio" },
  { key: "endividamento_curto_prazo", label: "Endivid. Curto Prazo",   formula: "PC ÷ AT",        type: "ratio" },
  { key: "endividamento_longo_prazo", label: "Endivid. Longo Prazo",   formula: "PNC ÷ AT",       type: "ratio" },
  { key: "composicao_endividamento", label: "Composição do Endivid.",  formula: "PC ÷ PT",        type: "ratio" },
  { key: "capital_terceiros",       label: "Capital de Terceiros",     formula: "PT ÷ (PT+PL)",   type: "ratio" },
  { key: "imobilizacao_pl",         label: "Imobilização do PL",       formula: "(AT−AC) ÷ PL",   type: "ratio" },
];

function exportCSV() {
  const rows: string[] = [
    "mes;AT;AC;ANC;PT;PC;PNC;PL;RL_acum;LC;EG;ECP;ELP;CompEnd;CapTerc;ImobPL",
  ];
  refData.meses.forEach((m) => {
    const r = m.resumo;
    const i = m.indicadores;
    rows.push([
      m.mes, r.ativo_total, r.ativo_circulante, r.ativo_nao_circulante, r.passivo_total,
      r.passivo_circulante, r.passivo_nao_circulante, r.patrimonio_liquido, r.receita_liquida_acum,
      i.liquidez_corrente, i.endividamento_geral, i.endividamento_curto_prazo, i.endividamento_longo_prazo,
      i.composicao_endividamento, i.capital_terceiros, i.imobilizacao_pl,
    ].map((v) => typeof v === "number" ? String(v).replace(".", ",") : v).join(";"));
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "endividamento_referencia_dip.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const TabEndividamentoReferencia = () => {
  const [mesSel, setMesSel] = useState<string>(refData.meses[refData.meses.length - 1].mesKey);
  const mes = useMemo(() => refData.meses.find((m) => m.mesKey === mesSel)!, [mesSel]);
  const calc = useMemo(() => recompute(mes), [mes]);

  // Global validations
  const equilibrios = useMemo(
    () => refData.meses.map((m) => {
      const c = recompute(m);
      return { mes: m.mes, mesKey: m.mesKey, ...c, ratio: c.equilibrio_diff / m.resumo.ativo_total };
    }),
    [],
  );
  const desbalanceados = equilibrios.filter((e) => Math.abs(e.ratio) > TOL_REL);
  const pcPncMismatch = equilibrios.filter((e) => Math.abs(e.pt_minus_components) > 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <FileBarChart2 className="w-4 h-4 text-[hsl(258,90%,66%)]" />
            Endividamento — Relatório Detalhado (Referência DIP)
          </h3>
          <p className="text-xs text-muted-foreground">
            Fonte: <span className="font-mono">{refData.fonte}</span> · {refData.persona} ·
            {" "}emitido {new Date(refData.emitidoEm).toLocaleDateString("pt-BR")} ·
            {" "}{refData.meses.length} meses ({refData.periodo.inicio} → {refData.periodo.fim})
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCSV}>
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </Button>
      </div>

      {/* Global validation banners */}
      {desbalanceados.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-amber-800 mb-1">
                Balanço desequilibrado em {desbalanceados.length} mês(es) — tolerância 0,5% (AT = PT + PL)
              </p>
              <ul className="space-y-0.5 text-amber-700">
                {desbalanceados.map((e) => (
                  <li key={e.mesKey}>
                    <b>{e.mes}</b>: Δ = {fmt(e.equilibrio_diff)} ({fmtPct(e.ratio)})
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
      {pcPncMismatch.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-amber-800 mb-1">
                PT ≠ PC + PNC em {pcPncMismatch.length} mês(es) — possível conta intermediária omitida no relatório
              </p>
              <ul className="space-y-0.5 text-amber-700">
                {pcPncMismatch.map((e) => (
                  <li key={e.mesKey}>
                    <b>{e.mes}</b>: PT − (PC+PNC) = {fmt(e.pt_minus_components)}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sumário Comparativo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sumário Comparativo (7 meses)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b-2 text-muted-foreground">
                <th className="text-left py-2 px-2 font-semibold">Mês</th>
                <th className="text-right px-2 font-semibold">AT</th>
                <th className="text-right px-2 font-semibold">PT</th>
                <th className="text-right px-2 font-semibold">PL</th>
                <th className="text-right px-2 font-semibold">Endiv. Geral</th>
                <th className="text-right px-2 font-semibold">Liq. Corrente</th>
                <th className="text-center px-2 font-semibold">A=P+PL</th>
              </tr>
            </thead>
            <tbody>
              {refData.meses.map((m) => {
                const c = recompute(m);
                const ratio = c.equilibrio_diff / m.resumo.ativo_total;
                const ok = Math.abs(ratio) <= TOL_REL;
                return (
                  <tr key={m.mesKey} className={`border-b border-border/20 hover:bg-muted/30 cursor-pointer ${mesSel === m.mesKey ? "bg-[hsl(258,90%,98%)]" : ""}`}
                      onClick={() => setMesSel(m.mesKey)}>
                    <td className="py-1.5 px-2 font-medium">{m.mes}</td>
                    <td className="text-right px-2">{fmt(m.resumo.ativo_total)}</td>
                    <td className="text-right px-2">{fmt(m.resumo.passivo_total)}</td>
                    <td className="text-right px-2">{fmt(m.resumo.patrimonio_liquido)}</td>
                    <td className="text-right px-2">{fmtPct(m.indicadores.endividamento_geral)}</td>
                    <td className="text-right px-2">{fmtDec(m.indicadores.liquidez_corrente)}</td>
                    <td className="text-center px-2">
                      {ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
                      ) : (
                        <span className="text-amber-700 text-[10px]" title={`Δ ${fmt(c.equilibrio_diff)}`}>
                          <AlertTriangle className="w-3.5 h-3.5 inline" /> {fmtPct(ratio)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Mês selecionado */}
      <Card className="border-[hsl(258,90%,66%)]/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">{mes.mes} — detalhamento</CardTitle>
            <Tabs value={mesSel} onValueChange={setMesSel}>
              <TabsList className="bg-muted/50 h-7">
                {refData.meses.map((m) => (
                  <TabsTrigger key={m.mesKey} value={m.mesKey} className="text-[10px] px-2 py-0.5">
                    {m.mesKey}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="resumo">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="resumo" className="text-[11px]">Resumo</TabsTrigger>
              <TabsTrigger value="ativo" className="text-[11px]">Ativo</TabsTrigger>
              <TabsTrigger value="passivo" className="text-[11px]">Passivo</TabsTrigger>
              <TabsTrigger value="pl" className="text-[11px]">PL</TabsTrigger>
              <TabsTrigger value="indicadores" className="text-[11px]">Indicadores (validação)</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="mt-3">
              <SimpleTable rows={[
                ["Ativo Total", mes.resumo.ativo_total],
                ["  Ativo Circulante", mes.resumo.ativo_circulante],
                ["  Ativo Não Circulante", mes.resumo.ativo_nao_circulante],
                ["Passivo Total", mes.resumo.passivo_total],
                ["  Passivo Circulante", mes.resumo.passivo_circulante],
                ["  Passivo Não Circulante", mes.resumo.passivo_nao_circulante],
                ["Patrimônio Líquido", mes.resumo.patrimonio_liquido],
                ["Receita Líquida (acum.)", mes.resumo.receita_liquida_acum],
              ]} totalRef={mes.resumo.ativo_total} />
            </TabsContent>

            <TabsContent value="ativo" className="mt-3 space-y-4">
              <SectionTable title="Ativo Circulante" data={mes.ativo_circulante} totalRef={mes.resumo.ativo_circulante} />
              <SectionTable title="Ativo Não Circulante" data={mes.ativo_nao_circulante} totalRef={mes.resumo.ativo_nao_circulante} />
            </TabsContent>

            <TabsContent value="passivo" className="mt-3 space-y-4">
              <SectionTable title="Passivo Circulante" data={mes.passivo_circulante} totalRef={mes.resumo.passivo_circulante} />
              <SectionTable title="Passivo Não Circulante" data={mes.passivo_nao_circulante} totalRef={mes.resumo.passivo_nao_circulante} />
            </TabsContent>

            <TabsContent value="pl" className="mt-3">
              <SectionTable title="Patrimônio Líquido" data={mes.patrimonio_liquido} totalRef={mes.resumo.patrimonio_liquido} />
            </TabsContent>

            <TabsContent value="indicadores" className="mt-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="border-b-2 text-muted-foreground">
                      <th className="text-left py-2 px-2 font-semibold">Indicador</th>
                      <th className="text-left px-2 font-semibold">Fórmula</th>
                      <th className="text-right px-2 font-semibold">Relatório</th>
                      <th className="text-right px-2 font-semibold">Recalculado</th>
                      <th className="text-center px-2 font-semibold">Validação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INDICADOR_LABELS.map((ind) => {
                      const stated = mes.indicadores[ind.key];
                      const computed = calc[ind.key] as number | null;
                      return (
                        <tr key={ind.key} className="border-b border-border/20 hover:bg-muted/30">
                          <td className="py-1.5 px-2 font-medium">{ind.label}</td>
                          <td className="px-2 text-muted-foreground">{ind.formula}</td>
                          <td className="text-right px-2">{ind.key === "liquidez_corrente" || ind.key === "imobilizacao_pl" ? fmtDec(stated) : fmtPct(stated)}</td>
                          <td className="text-right px-2">{ind.key === "liquidez_corrente" || ind.key === "imobilizacao_pl" ? fmtDec(computed) : fmtPct(computed)}</td>
                          <td className="text-center px-2">{deltaBadge(stated, computed, "ratio")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Tolerância: 0,5pp para ratios. Quando "Recalculado" diverge do "Relatório", indica que o relatório-fonte e o motor da plataforma estão usando bases distintas — investigar o motor de indicadores.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

function SimpleTable({ rows, totalRef }: { rows: [string, number][]; totalRef: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="border-b-2 text-muted-foreground">
            <th className="text-left py-2 px-2 font-semibold">Item</th>
            <th className="text-right px-2 font-semibold">Valor (R$)</th>
            <th className="text-right px-2 font-semibold">% Ativo Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-border/20 hover:bg-muted/30">
              <td className="py-1.5 px-2 font-medium whitespace-pre">{k}</td>
              <td className="text-right px-2">{fmt(v)}</td>
              <td className="text-right px-2 text-muted-foreground">{totalRef ? fmtPct(v / totalRef) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionTable({ title, data, totalRef }: { title: string; data: Record<string, number>; totalRef: number }) {
  const entries = Object.entries(data);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  const ok = Math.abs(sum - totalRef) <= Math.abs(totalRef) * TOL_REL;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-bold">{title}</h4>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">Σ componentes: <b className="text-foreground">{fmt(sum)}</b></span>
          <span className="text-muted-foreground">· Total: <b className="text-foreground">{fmt(totalRef)}</b></span>
          {ok ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>
          ) : (
            <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" />Δ {fmt(sum - totalRef)}</Badge>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="border-b-2 text-muted-foreground">
              <th className="text-left py-2 px-2 font-semibold">Componente</th>
              <th className="text-right px-2 font-semibold">Valor (R$)</th>
              <th className="text-right px-2 font-semibold">% do grupo</th>
              <th className="text-right px-2 font-semibold">% Ativo Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-1.5 px-2 font-medium">{k.replace(/_/g, " ")}</td>
                <td className="text-right px-2">{fmt(v)}</td>
                <td className="text-right px-2 text-muted-foreground">{totalRef ? fmtPct(v / totalRef) : "—"}</td>
                <td className="text-right px-2 text-muted-foreground">{fmt((v / totalRef) * 100, 2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TabEndividamentoReferencia;
