// Fase 6 — Seletor de intervalo customizado (de → até)
// Lista os períodos disponíveis e permite ao usuário escolher início e fim.
import { Calendar } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface PeriodKey { ano: number; mes: number; key: string; label: string }

interface Props {
  periodos: PeriodKey[]; // ordem cronológica crescente
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  className?: string;
}

export default function PeriodRangeSelector({ periodos, from, to, onChange, className }: Props) {
  if (!periodos.length) return null;
  return (
    <div className={`flex items-center gap-2 text-xs ${className || ""}`}>
      <Calendar className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
      <Label className="text-[11px] text-muted-foreground">Intervalo:</Label>
      <Select value={from ?? periodos[0].key} onValueChange={(v) => onChange(v, to ?? periodos[periodos.length - 1].key)}>
        <SelectTrigger className="h-7 w-[130px] text-xs capitalize"><SelectValue /></SelectTrigger>
        <SelectContent>
          {periodos.map(p => (
            <SelectItem key={p.key} value={p.key} className="text-xs capitalize">{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">→</span>
      <Select value={to ?? periodos[periodos.length - 1].key} onValueChange={(v) => onChange(from ?? periodos[0].key, v)}>
        <SelectTrigger className="h-7 w-[130px] text-xs capitalize"><SelectValue /></SelectTrigger>
        <SelectContent>
          {periodos.map(p => (
            <SelectItem key={p.key} value={p.key} className="text-xs capitalize">{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
