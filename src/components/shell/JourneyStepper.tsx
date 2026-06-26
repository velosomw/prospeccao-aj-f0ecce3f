import { Check, AlertTriangle, Lock } from "lucide-react";

export interface JourneyStep {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  status: "concluido" | "em_andamento" | "pendente" | "bloqueado";
  hint?: string;
  percent?: number;
}

interface Props {
  steps: JourneyStep[];
  active: number;
  onStepClick?: (id: number) => void;
}

const colorByStatus = {
  concluido: { bg: "hsl(142,76%,36%)", text: "white", ring: "hsl(142,76%,36%)" },
  em_andamento: { bg: "hsl(258,90%,56%)", text: "white", ring: "hsl(258,90%,56%)" },
  pendente: { bg: "hsl(38,92%,50%)", text: "white", ring: "hsl(38,92%,50%)" },
  bloqueado: { bg: "hsl(220,15%,75%)", text: "white", ring: "hsl(220,15%,75%)" },
};

export default function JourneyStepper({ steps, active, onStepClick }: Props) {
  return (
    <div className="bg-white border border-border rounded-lg p-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        {steps.map((s) => {
          const c = colorByStatus[s.status];
          const isActive = s.id === active;
          const Icon = s.status === "concluido" ? Check : s.status === "bloqueado" ? Lock : AlertTriangle;
          return (
            <button
              key={s.id}
              onClick={() => onStepClick?.(s.id)}
              className={`text-left rounded-lg border-2 transition-all p-3 flex items-center gap-3 ${
                isActive ? "border-[hsl(258,90%,56%)] bg-[hsl(258,90%,98%)]" : "border-border bg-white hover:border-[hsl(217,91%,50%)]/40"
              }`}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: c.bg, color: c.text }}
              >
                {s.id}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{s.label}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Icon className="w-3 h-3" style={{ color: c.bg }} />
                  <span className="truncate">{s.hint || ""}</span>
                </div>
              </div>
              {typeof s.percent === "number" && (
                <div className="text-xs font-bold text-muted-foreground flex-shrink-0">
                  {s.percent}%
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
