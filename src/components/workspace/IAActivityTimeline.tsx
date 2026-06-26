interface Event { time: string; label: string; detail?: string; color?: string; }
interface Props { events: Event[]; }

export default function IAActivityTimeline({ events }: Props) {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Atividade da IA</h3>
        <button className="text-[10px] text-[hsl(217,91%,50%)] hover:underline">Ver tudo</button>
      </div>
      <div className="space-y-3">
        {events.length === 0 && (
          <div className="text-xs text-muted-foreground">Sem atividade recente.</div>
        )}
        {events.map((e, i) => (
          <div key={i} className="flex gap-2 text-xs">
            <span className="text-muted-foreground font-mono w-10 flex-shrink-0">{e.time}</span>
            <span
              className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
              style={{ background: e.color || "hsl(217,91%,50%)" }}
            />
            <div className="flex-1 leading-tight">
              <div className="font-semibold text-foreground">{e.label}</div>
              {e.detail && <div className="text-muted-foreground text-[11px]">{e.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
