// Seletor global de janela de consolidação (1M / 3M / 6M / 12M).
// O "M" é sempre ancorado ao mês atual (competência selecionada).
// 1M = mês corrente apenas. 3/6/12 = acumula meses anteriores.
import { Button } from "@/components/ui/button";
import { Layers } from "lucide-react";

export type Janela = 1 | 3 | 6 | 12;

const OPTIONS: { value: Janela; label: string; help: string }[] = [
  { value: 1, label: "Mês", help: "Apenas o mês selecionado" },
  { value: 3, label: "3M", help: "Mês atual + 2 anteriores" },
  { value: 6, label: "6M", help: "Mês atual + 5 anteriores" },
  { value: 12, label: "12M", help: "Mês atual + 11 anteriores" },
];

interface Props {
  value: Janela;
  onChange: (v: Janela) => void;
}

export default function WindowSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
      <Layers className="w-3.5 h-3.5 text-[hsl(217,91%,50%)] ml-1.5" />
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          size="sm"
          variant="ghost"
          title={o.help}
          onClick={() => onChange(o.value)}
          className={`h-7 px-2 text-[11px] font-semibold ${
            value === o.value
              ? "bg-[hsl(217,91%,50%)] text-white hover:bg-[hsl(217,91%,45%)]"
              : "text-muted-foreground"
          }`}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/** Calcula o intervalo {from, to} dado a âncora (mês atual) e a janela em meses. */
export function computeJanelaRange(
  anchor: { ano: number; mes: number } | null,
  janela: Janela,
): { from: { ano: number; mes: number }; to: { ano: number; mes: number } } | null {
  if (!anchor) return null;
  const to = { ano: anchor.ano, mes: anchor.mes };
  const d = new Date(anchor.ano, anchor.mes - 1 - (janela - 1), 1);
  const from = { ano: d.getFullYear(), mes: d.getMonth() + 1 };
  return { from, to };
}

export function isInJanela(
  p: { ano: number; mes: number },
  range: { from: { ano: number; mes: number }; to: { ano: number; mes: number } } | null,
): boolean {
  if (!range) return true;
  const k = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;
  const pk = k(p.ano, p.mes);
  return pk >= k(range.from.ano, range.from.mes) && pk <= k(range.to.ano, range.to.mes);
}

export function janelaLabel(j: Janela) {
  return j === 1 ? "Mês atual" : `Últimos ${j} meses`;
}
