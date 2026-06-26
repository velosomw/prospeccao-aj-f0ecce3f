import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

interface Props {
  count: number;
  onAction?: () => void;
}

export default function AttentionBanner({ count, onAction }: Props) {
  const [hidden, setHidden] = useState(false);
  if (hidden || count <= 0) return null;
  return (
    <div className="bg-[hsl(38,92%,50%)]/10 border border-[hsl(38,92%,50%)]/30 rounded-lg px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-[hsl(38,92%,50%)] flex-shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-semibold text-foreground">Atenção: </span>
        <span className="text-foreground/80">
          {count} {count === 1 ? "tópico precisa" : "tópicos precisam"} de revisão para melhorar seu Score.
        </span>
      </div>
      <button
        onClick={onAction}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[hsl(38,92%,50%)] text-[hsl(38,92%,40%)] hover:bg-[hsl(38,92%,50%)]/10 transition-colors"
      >
        Ver pendências
      </button>
      <button onClick={() => setHidden(true)} className="text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
