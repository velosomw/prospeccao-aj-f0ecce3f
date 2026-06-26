import { Button } from "@/components/ui/button";

export type Window = "3M" | "6M" | "12M" | "ALL";

const OPTS: { v: Window; label: string; n: number }[] = [
  { v: "3M", label: "3M", n: 3 },
  { v: "6M", label: "6M", n: 6 },
  { v: "12M", label: "12M", n: 12 },
  { v: "ALL", label: "Todos", n: Infinity },
];

export const applyWindow = <T,>(rows: T[], w: Window): T[] => {
  const opt = OPTS.find(o => o.v === w);
  if (!opt || !Number.isFinite(opt.n)) return rows;
  return rows.slice(-opt.n);
};

interface Props {
  value: Window;
  onChange: (w: Window) => void;
  available: number;
}

const WindowSelector = ({ value, onChange, available }: Props) => (
  <div className="inline-flex rounded-lg border bg-muted/30 p-1 gap-1">
    {OPTS.map(o => {
      const disabled = Number.isFinite(o.n) && available < o.n;
      return (
        <Button
          key={o.v}
          size="sm"
          variant={value === o.v ? "default" : "ghost"}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className="h-7 px-3 text-xs"
        >
          {o.label}
        </Button>
      );
    })}
  </div>
);

export default WindowSelector;
