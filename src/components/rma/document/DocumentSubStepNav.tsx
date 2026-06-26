import { Sparkles, FileText } from "lucide-react";
import type { DocumentSubStep } from "@/types/documentEditor";

interface Props {
  activeStep: DocumentSubStep;
  onStepChange: (step: DocumentSubStep) => void;
  allCompleted: boolean;
}

const steps = [
  { value: "escopo" as const, label: "Escopo IA", icon: Sparkles, description: "Geração, edição e conclusão por seção" },
  { value: "relatorio" as const, label: "Revisão", icon: FileText, description: "Documento estruturado A4" },
];

const DocumentSubStepNav = ({ activeStep, onStepChange }: Props) => {
  const activeIdx = steps.findIndex(s => s.value === activeStep);

  return (
    <div className="flex gap-2 mb-4">
      {steps.map((step, i) => {
        const isActive = activeStep === step.value;
        const isCompleted = i < activeIdx;
        const Icon = step.icon;
        return (
          <button
            key={step.value}
            onClick={() => onStepChange(step.value)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
              isActive
                ? "bg-[hsl(217,91%,50%)] text-white border-[hsl(217,91%,50%)] shadow-sm"
                : isCompleted
                  ? "bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)]/20"
                  : "bg-muted/50 text-muted-foreground border-border"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{step.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default DocumentSubStepNav;
