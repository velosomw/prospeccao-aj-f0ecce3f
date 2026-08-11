// Fluxo de Caixa consolidado por período (F3 do MD de Reformulação do Balancete).
// Lê `fluxo_caixa_consolidado` populado pelo edge `balancete-build`.
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDownCircle, ArrowUpCircle, Wallet, Loader2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { useFluxoCaixa, type FCXRow, type JanelaRange } from "@/hooks/useFluxoCaixa";

interface Props {
  companyId: string | null;
  periodo?: { ano: number; mes: number } | null;
  runToken?: string;
  janela?: JanelaRange | null;
}

const fmtBRL = (v?: number | null) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const monthLabel = (a: number, m: number) =>
  new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

const CAT_LABEL: Record<string, string> = {
  operacional: "Atividades Operacionais",
  investimento: "Atividades de Investimento",
  financiamento: "Atividades de Financiamento",
  caixa_inicial: "Caixa Inicial",
  caixa_final: "Caixa Final",
};

const CAT_COLOR: Record<string, string> = {
  operacional: "hsl(217,91%,50%)",
  investimento: "hsl(38,92%,50%)",
  financiamento: "hsl(258,90%,66%)",
};

function groupByPeriod(rows: FCXRow[]) {
  const map = new Map<string, { ano: number; mes: number; operacional: number; investimento: number; financiamento: number; caixa_inicial: number; caixa_final: number; entradas: number; saidas: number }>();
  for (const r of rows) {
    const k = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
    let acc = map.get(k);
    if (!acc) {
      acc = { ano: r.ano, mes: r.mes, operacional: 0, investimento: 0, financiamento: 0, caixa_inicial: 0, caixa_final: 0, entradas: 0, saidas: 0 };
      map.set(k, acc);
    }
    const valor = Number(r.valor || 0);
    if (r.categoria in acc) (acc as any)[r.categoria] += valor;
    acc.entradas += Number(r.entradas || 0);
    acc.saidas += Number(r.saidas || 0);
  }
  return Array.from(map.values()).sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
}

const ProspecçãoFluxoCaixaTab = ({ companyId, periodo, runToken, janela }: Props) => {
  const { rows, allRows, loading } = useFluxoCaixa(companyId, periodo, runToken, janela ?? null);

  const byPeriod = useMemo(() => groupByPeriod(rows), [rows]);
  const totals = useMemo(() => {
    return byPeriod.reduce(
      (acc, p) => {
        acc.operacional += p.operacional;
        acc.investimento += p.investimento;
        acc.financiamento += p.financiamento;
        acc.entradas += p.entradas;
        acc.saidas += p.saidas;
        return acc;
      },
      { operacional: 0, investimento: 0, financiamento: 0, entradas: 0, saidas: 0 },
    );
  }, [byPeriod]);

  const variacaoCaixa = totals.operacional + totals.investimento + totals.financiamento;

  const chartData = byPeriod.map(p => ({
    label: monthLabel(p.ano, p.mes),
    Operacional: Math.round(p.operacional),
    Investimento: Math.round(p.investimento),
    Financiamento: Math.round(p.financiamento),
  }));

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando fluxo de caixa…
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhum fluxo de caixa consolidado ainda. Execute o pipeline do <b>Balancete</b> para popular.
          <p className="text-xs mt-1 opacity-70">Tabela: <code>fluxo_caixa_consolidado</code> (populada pelo edge <code>balancete-build</code>).</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Entradas (∑)" value={fmtBRL(totals.entradas)} color="hsl(142,76%,36%)" icon={<ArrowUpCircle className="w-4 h-4" />} />
        <KPI label="Saídas (∑)" value={fmtBRL(-Math.abs(totals.saidas))} color="hsl(0,84%,60%)" icon={<ArrowDownCircle className="w-4 h-4" />} />
        <KPI label="FC Operacional" value={fmtBRL(totals.operacional)} color={CAT_COLOR.operacional} />
        <KPI label="Variação de Caixa" value={fmtBRL(variacaoCaixa)} color={variacaoCaixa >= 0 ? "hsl(142,76%,36%)" : "hsl(0,84%,60%)"} />
      </div>

      {/* Gráfico por período */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            Fluxo de Caixa por Categoria (mensal)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFoprospecçãotter={(v) => Intl.NumberFoprospecçãot("pt-BR", { notation: "compact" }).foprospecçãot(v as number)} />
                <Tooltip formatter={(v: number) => fmtBRL(v)} />
                <Legend />
                <Bar dataKey="Operacional" fill={CAT_COLOR.operacional} />
                <Bar dataKey="Investimento" fill={CAT_COLOR.investimento} />
                <Bar dataKey="Financiamento" fill={CAT_COLOR.financiamento} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Tabela detalhada por período */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">DFC — Visão por período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b-2 text-muted-foreground">
                  <th className="text-left py-2 px-2">Período</th>
                  <th className="text-right px-2">Caixa Inicial</th>
                  <th className="text-right px-2">Operacional</th>
                  <th className="text-right px-2">Investimento</th>
                  <th className="text-right px-2">Financiamento</th>
                  <th className="text-right px-2 font-semibold">Variação</th>
                  <th className="text-right px-2">Caixa Final</th>
                </tr>
              </thead>
              <tbody>
                {byPeriod.map(p => {
                  const variacao = p.operacional + p.investimento + p.financiamento;
                  return (
                    <tr key={`${p.ano}-${p.mes}`} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-1.5 px-2 font-medium">{monthLabel(p.ano, p.mes)}</td>
                      <td className="text-right px-2">{fmtBRL(p.caixa_inicial)}</td>
                      <td className="text-right px-2">{fmtBRL(p.operacional)}</td>
                      <td className="text-right px-2">{fmtBRL(p.investimento)}</td>
                      <td className="text-right px-2">{fmtBRL(p.financiamento)}</td>
                      <td className={`text-right px-2 font-semibold ${variacao < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {fmtBRL(variacao)}
                      </td>
                      <td className="text-right px-2">{fmtBRL(p.caixa_final)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Fonte: <code>fluxo_caixa_consolidado</code> · {allRows.length} linhas · {byPeriod.length} períodos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

const KPI = ({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) => (
  <Card>
    <CardContent className="py-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color }}>{value}</div>
    </CardContent>
  </Card>
);

export default ProspecçãoFluxoCaixaTab;
