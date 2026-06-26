import { useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface MathChallengeHandle {
  validate: () => boolean;
  reset: () => void;
}

interface Props {
  labelClassName?: string;
  inputClassName?: string;
  iconClassName?: string;
}

const rand = () => Math.floor(Math.random() * 9) + 1;

const MathChallenge = forwardRef<MathChallengeHandle, Props>(
  ({ labelClassName, inputClassName, iconClassName }, ref) => {
    const [a, setA] = useState(rand);
    const [b, setB] = useState(rand);
    const [answer, setAnswer] = useState("");

    const regenerate = () => {
      setA(rand());
      setB(rand());
      setAnswer("");
    };

    useEffect(() => {
      regenerate();
    }, []);

    useImperativeHandle(ref, () => ({
      validate: () => Number(answer) === a + b,
      reset: regenerate,
    }));

    return (
      <div className="space-y-1.5">
        <Label className={labelClassName ?? "text-muted-foreground text-sm"}>
          Verificação: quanto é {a} + {b}?
        </Label>
        <div className="relative">
          <Input
            type="number"
            inputMode="numeric"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Digite o resultado"
            className={inputClassName}
            required
          />
          <button
            type="button"
            onClick={regenerate}
            aria-label="Gerar novo desafio"
            className={
              "absolute right-3 top-1/2 -translate-y-1/2 transition-colors " +
              (iconClassName ?? "text-muted-foreground hover:text-foreground")
            }
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  },
);

MathChallenge.displayName = "MathChallenge";

export default MathChallenge;
