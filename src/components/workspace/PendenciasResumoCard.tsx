import { AlertOctagon, AlertTriangle, FileX, ArrowRight } from "lucide-react";

interface Props {
  criticas: number;
  inconsistencias: number;
  faltantes: number;
  onResolve?: () => void;
}

export default function PendenciasResumoCard({ criticas, inconsistencias, faltantes, onResolve }: Props) {
  const rows = [
    { label: "Críticas", value: criticas, color: "hsl(0,84%,60%)", icon: AlertOctagon },
    { label: "Inconsistências", value: inconsistencias, color: "hsl(38,92%,50%)", icon: AlertTriangle },
    { label: "Documentos faltantes", value: faltantes, color: "hsl(220,10%,46%)", icon: FileX },
  ];
  return (
    <div className="bg-white border border-border rounded-lg p-4 flex flex-col">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Resumo de Pendências
      </h3>
      <div className="flex-1 space-y-2">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.label} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" style={{ color: r.color }} />
                <span className="text-sm text-foreground">{r.label}</span>
              </div>
              <span className="text-sm font-bold text-foreground">{r.value}</span>
            </div>
          );
        })}
      </div>
      <button
        onClick={onResolve}
        className="mt-3 w-full bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white text-sm font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
      >
        Resolver agora <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
