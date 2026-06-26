import { Lightbulb, ArrowRight } from "lucide-react";

interface Props {
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export default function IATipCard({ message, ctaLabel = "Ver recomendações", onCta }: Props) {
  return (
    <div className="bg-gradient-to-br from-[hsl(258,90%,98%)] to-[hsl(217,91%,98%)] border border-[hsl(258,90%,56%)]/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[hsl(258,90%,56%)] flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-white" />
        </div>
        <span className="text-xs font-bold text-foreground uppercase tracking-wide">Dica da IA</span>
      </div>
      <p className="text-xs text-foreground/80 leading-relaxed mb-3">{message}</p>
      <button
        onClick={onCta}
        className="w-full bg-white border border-[hsl(258,90%,56%)]/30 hover:bg-[hsl(258,90%,56%)]/5 text-[hsl(258,90%,40%)] text-xs font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5 transition-colors"
      >
        {ctaLabel} <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}
