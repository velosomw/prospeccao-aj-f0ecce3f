interface Props {
  processados: number;
  pendentes: number;
  incompletos: number;
  total: number;
}

export default function ProcessingProgressCard({ processados, pendentes, incompletos, total }: Props) {
  const pct = total > 0 ? Math.round((processados / total) * 100) : 0;
  return (
    <div className="bg-white border border-border rounded-lg p-4 flex flex-col">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Progresso do Processamento
      </h3>
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-3xl font-bold text-foreground">
          {processados} <span className="text-base font-normal text-muted-foreground">de {total}</span>
        </div>
        <div className="text-xs text-muted-foreground mb-3">Tópicos processados</div>
        <div className="w-full h-2 rounded-full bg-[hsl(220,15%,92%)] overflow-hidden">
          <div className="h-full bg-[hsl(217,91%,50%)] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div>
            <div className="text-lg font-bold text-[hsl(142,76%,36%)]">{processados}</div>
            <div className="text-[10px] text-muted-foreground">Processados</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[hsl(38,92%,50%)]">{pendentes}</div>
            <div className="text-[10px] text-muted-foreground">Pendentes</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[hsl(0,84%,60%)]">{incompletos}</div>
            <div className="text-[10px] text-muted-foreground">Incompletos</div>
          </div>
        </div>
      </div>
    </div>
  );
}
