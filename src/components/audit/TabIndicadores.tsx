/**
 * TabIndicadores — Aba "Indicadores Econômico-Financeiros"
 * Replicação fiel da especificação ABA_INDICADORES_REPLICACAO.md.
 * - 4 quadros (Liquidez · Endividamento · Atividade · Rentabilidade)
 * - Card EBITDA Estimado (usa série canônica `ebitda`)
 * - Popover de Fórmula (FormulaInfo) por indicador
 * - Headers de período via mesKeyToLabel
 * - Flags naROE / naImobilizacao / naCobertura → "N/A" com tooltip
 */
import { useMemo } from "react";
import { Activity, PieChart, BarChart3, TrendingUp, Calculator, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildIndicatorSeries, type IndicatorRow } from "@/services/indicatorsEngine";
import { mesKeyToLabel, type BSDadosRow } from "@/services/bsDadosBuilder";

/* ───────────── Foprospeccaotters ───────────── */
const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(Number.isFinite(n) ? n : 0));
const fmtPct = (n: number) =>
  `${((Number.isFinite(n) ? n : 0) * 100).toFixed(1)}%`;
const fmtDays = (n: number) =>
  `${Math.round(Number.isFinite(n) ? n : 0)} dias`;
const fmtCob = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}x`;
const fmtDec = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);

const periodLabel = (y: string) =>
  /^\d{4}-\d{1,2}$/.test(y) ? mesKeyToLabel(y) : y;

/* ───────────── Popover de Fórmula ───────────── */
function FormulaInfo({
  title, formula, accounts,
}: { title: string; formula: string; accounts: string[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Fórmula de ${title}`}
          className="p-1 hover:bg-muted rounded-full transition-colors"
        >
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 space-y-3">
        <h4 className="text-sm font-bold border-b pb-1">{title}</h4>
        <div className="space-y-1">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground">Fórmula:</p>
          <p className="text-xs font-mono bg-muted/50 p-2 rounded border">{formula}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground">
            Contas/Grupos que alimentam o cálculo:
          </p>
          <ul className="text-[10.5px] space-y-1 list-disc pl-4 text-foreground/80">
            {accounts.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────── Definição declarativa dos quadros ───────────── */
type Item = {
  label: string;
  key: keyof IndicatorRow;
  fmt: (n: number) => string;
  formula: string;
  benchmark: string;
  accounts: string[];
  naFlag?: keyof IndicatorRow;       // se true → "N/A"
  naTooltip?: string;
};
type Section = { title: string; icon: typeof Activity; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: "Liquidez", icon: Activity,
    items: [
      { label: "Liquidez Corrente",  key: "liquidezCorrente",  fmt: fmtDec, formula: "AC / PC",
        benchmark: "> 1,5",
        accounts: ["Ativo Circulante (Grupo 1.1)", "Passivo Circulante (Grupo 2.1)"] },
      { label: "Liquidez Seca",      key: "liquidezSeca",      fmt: fmtDec, formula: "(AC - EST) / PC",
        benchmark: "> 1,0",
        accounts: ["AC (1.1)", "Estoques (Ref 1: D)", "PC (2.1)"] },
      { label: "Liquidez Imediata",  key: "liquidezImediata",  fmt: fmtDec, formula: "Caixa / PC",
        benchmark: "> 0,3",
        accounts: ["Disponibilidades (Refs 1: A, B)", "PC (2.1)"] },
      { label: "Liquidez Geral",     key: "liquidezGeral",     fmt: fmtDec, formula: "(AC + RLP) / (PC + PNC)",
        benchmark: "> 0,1",
        accounts: ["AC (1.1)", "RLP (1.2.1)", "PC (2.1)", "PNC (2.2)"] },
    ],
  },
  {
    title: "Endividamento", icon: PieChart,
    items: [
      { label: "Endividamento Total", key: "endividamentoGeral", fmt: fmtPct,
        formula: "PT / AT", benchmark: "< 60%",
        accounts: ["Passivo Total (PC+PNC)", "Ativo Total"] },
      { label: "Composição Endividamento", key: "composicaoEndividamento", fmt: fmtPct,
        formula: "PC / PT", benchmark: "< 50%",
        accounts: ["Passivo Circulante", "Passivo Total (exigível)"] },
      { label: "Imobilização do PL", key: "imobilizacaoPL", fmt: fmtPct,
        formula: "Imob / PL", benchmark: "< 80%",
        accounts: ["Imobilizado (Ref 1: R)", "PL (2.3)"],
        naFlag: "naImobilizacao", naTooltip: "PL negativo" },
      { label: "Cobertura de Juros", key: "coberturaJuros", fmt: fmtCob,
        formula: "LAJIR / Juros", benchmark: "> 3,0x",
        accounts: ["Resultado Operacional", "Despesas Financeiras (Grupo 7)"],
        naFlag: "naCobertura", naTooltip: "Sem despesa financeira" },
    ],
  },
  {
    title: "Atividade", icon: BarChart3,
    items: [
      { label: "Giro do Ativo", key: "giroAtivo", fmt: fmtDec, formula: "V / AT", benchmark: "> 0,5",
        accounts: ["Receita Líquida (Grupo 3)", "Ativo Total"] },
      { label: "PMR", key: "pmr", fmt: fmtDays, formula: "DR×30 / V", benchmark: "< 60d",
        accounts: ["Contas a Receber (Ref 1: C)", "Receita Líquida"] },
      { label: "PMP", key: "pmp", fmt: fmtDays, formula: "DP×30 / CMV", benchmark: "< 45d",
        accounts: ["Fornecedores (Refs BB, PP)", "CMV (Grupo 4)"] },
      { label: "Idade Média Estoque", key: "idadeMediaEstoque", fmt: fmtDays,
        formula: "EST×30 / CMV", benchmark: "< 90d",
        accounts: ["Estoques (Ref 1: D)", "CMV (Grupo 4)"] },
    ],
  },
  {
    title: "Rentabilidade", icon: TrendingUp,
    items: [
      { label: "Margem Líquida",     key: "margemLiquida",     fmt: fmtPct, formula: "LL / V", benchmark: "> 10%",
        accounts: ["Lucro Líquido", "Receita Líquida"] },
      { label: "Margem Operacional", key: "margemOperacional", fmt: fmtPct, formula: "LAJIR / V", benchmark: "> 15%",
        accounts: ["LAJIR (proxy)", "Receita Líquida"] },
      { label: "ROE (anual.)",       key: "roe",               fmt: fmtPct, formula: "(LL / PL) × 12", benchmark: "> 15%",
        accounts: ["Lucro Líquido", "PL (2.3)"],
        naFlag: "naROE", naTooltip: "PL negativo" },
      { label: "ROA (anual.)",       key: "roa",               fmt: fmtPct, formula: "(LL / AT) × 12", benchmark: "> 5%",
        accounts: ["Lucro Líquido", "Ativo Total"] },
    ],
  },
];

/* ───────────── Componente ───────────── */
export interface TabIndicadoresProps {
  rows: BSDadosRow[];
}

export default function TabIndicadores({ rows }: TabIndicadoresProps) {
  const series = useMemo(() => buildIndicatorSeries(rows), [rows]);
  const years = useMemo(() => Object.keys(series).sort(), [series]);
  const hasComputed = years.length > 0;

  if (!hasComputed) {
    return (
      <div className="rounded-lg border bg-muted/20 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Sem base BS &amp; Dados para calcular indicadores. Carregue documentos e processe a extração.
        </p>
      </div>
    );
  }

  const renderCell = (item: Item, y: string) => {
    const row = series[y] as IndicatorRow | undefined;
    if (!row) return <span className="text-muted-foreground">—</span>;
    if (item.naFlag && (row as any)[item.naFlag]) {
      return (
        <span
          className="text-muted-foreground italic"
          title={item.naTooltip ?? "Não aplicável"}
        >
          N/A
        </span>
      );
    }
    const v = (row as any)[item.key] as number;
    return item.fmt(v);
  };

  return (
    <div className="space-y-4">
      {/* 4 quadros */}
      <div className="grid md:grid-cols-2 gap-4">
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          return (
            <Card key={sec.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="w-4 h-4 text-accent" />
                  {sec.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Índice</TableHead>
                      <TableHead className="text-[10px]">Fórmula</TableHead>
                      {years.map((y) => (
                        <TableHead key={y} className="text-right text-[10px] whitespace-nowrap">
                          {periodLabel(y)}
                        </TableHead>
                      ))}
                      <TableHead className="text-right text-[10px]">Benchmark</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sec.items.map((item) => (
                      <TableRow key={String(item.key)}>
                        <TableCell className="text-xs font-medium">
                          <div className="flex items-center gap-1.5">
                            {item.label}
                            <FormulaInfo
                              title={item.label}
                              formula={item.formula}
                              accounts={item.accounts}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground font-mono">
                          {item.formula}
                        </TableCell>
                        {years.map((y) => (
                          <TableCell key={y} className="text-right text-xs font-mono">
                            {renderCell(item, y)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right text-[10px] text-muted-foreground">
                          {item.benchmark}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Card EBITDA Estimado */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4 text-accent" />
            EBITDA Estimado
            <FormulaInfo
              title="EBITDA Estimado"
              formula="LAJIR + Depreciação + Amortização"
              accounts={[
                "Resultado Operacional (LAJIR)",
                "Despesas Financeiras (Grupo 7)",
                "Depreciação/Amortização (quando disponível)",
              ]}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(years.length, 1), 6)}, minmax(0,1fr))` }}
          >
            {years.map((y) => {
              const row = series[y];
              const ebitda = row?.ebitda ?? 0;
              return (
                <div key={y} className="p-4 rounded-lg bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground">{periodLabel(y)}</p>
                  <p className="text-lg font-bold font-mono text-foreground">{fmt(ebitda)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">LAJIR + Dep. + Amort.</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
