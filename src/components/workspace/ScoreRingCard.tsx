import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Props {
  score: number;
  trend?: "up" | "down" | "stable";
}

function colorFor(score: number) {
  if (score < 33) return { ring: "hsl(0,84%,60%)", label: "RISCO ALTO", text: "text-[hsl(0,84%,45%)]" };
  if (score < 67) return { ring: "hsl(38,92%,50%)", label: "RISCO MÉDIO", text: "text-[hsl(38,92%,40%)]" };
  return { ring: "hsl(142,76%,36%)", label: "RISCO BAIXO", text: "text-[hsl(142,76%,30%)]" };
}

export default function ScoreRingCard({ score, trend = "down" }: Props) {
  const c = colorFor(score);
  const r = 56;
  const cir = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * cir;
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <div className="bg-white border border-border rounded-lg p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prospecção AJ Score (Qualidade)</h3>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center py-2">
        <div className="relative w-[140px] h-[140px]">
          <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
            <circle cx="70" cy="70" r={r} stroke="hsl(220,15%,92%)" strokeWidth="10" fill="none" />
            <circle
              cx="70" cy="70" r={r} stroke={c.ring} strokeWidth="10" fill="none"
              strokeDasharray={`${dash} ${cir}`} strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold text-foreground">{Math.round(score)}</div>
            <div className={`text-[10px] font-bold ${c.text}`}>{c.label}</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
          <TrendIcon className="w-3 h-3" />
          <span>Tendência de {trend === "up" ? "alta" : trend === "down" ? "queda" : "estabilidade"}</span>
        </div>
      </div>
    </div>
  );
}
