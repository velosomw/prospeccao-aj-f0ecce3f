// Fase 6 — Badge compacto mostrando variação % (MoM ou YoY).
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  label: string; // "MoM" | "YoY" | etc
  current: number | null | undefined;
  previous: number | null | undefined;
  invert?: boolean; // se true, queda é positiva (ex: custos)
}

export default function VariacaoBadge({ label, current, previous, invert }: Props) {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
        <Minus className="w-2.5 h-2.5" /> {label} —
      </span>
    );
  }
  const delta = (current - previous) / Math.abs(previous);
  const positiveGood = invert ? delta < 0 : delta > 0;
  const isFlat = Math.abs(delta) < 0.001;
  const color = isFlat
    ? "bg-muted text-muted-foreground"
    : positiveGood
      ? "bg-emerald-500/15 text-emerald-700"
      : "bg-rose-500/15 text-rose-700";
  const Icon = isFlat ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      {label} {(delta * 100).toFixed(1).replace(".", ",")}%
    </span>
  );
}
