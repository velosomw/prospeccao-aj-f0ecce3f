import { ChevronDown, Cpu } from "lucide-react";
import ScoreRingCard from "@/components/workspace/ScoreRingCard";
import ProcessingProgressCard from "@/components/workspace/ProcessingProgressCard";
import PendenciasResumoCard from "@/components/workspace/PendenciasResumoCard";
import SaudeRelatorioCard from "@/components/workspace/SaudeRelatorioCard";
import RmaDipKpiCards from "@/components/workspace/RmaDipKpiCards";
import type { Competencia } from "@/components/prospecção/CompetenciaSelector";

interface Props {
  score: number;
  completos: number;
  pendentes: number;
  incompletos: number;
  total: number;
  criticas: number;
  inconsistencias: number;
  faltantes: number;
  docsPct: number;
  dadosPct: number;
  validacoesPct: number;
  events: { time: string; label: string; color: string }[];
  isAnalyzing: boolean;
  companyId: string | null;
  competencia: Competencia | null;
  runToken: string;
  janela: { from: { ano: number; mes: number }; to: { ano: number; mes: number } } | null;
  bsParsed: any;
  bsEntries: any;
  prospecçãoId?: string;
}

export default function StageProcessamentoIA(p: Props) {
  return (
    <div className="space-y-4">
      {p.isAnalyzing && (
        <div className="bg-[hsl(258,90%,98%)] border border-[hsl(258,90%,56%)]/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <Cpu className="w-5 h-5 text-[hsl(258,90%,56%)] animate-pulse flex-shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-foreground">A IA está processando os dados.</span>
            <span className="text-muted-foreground"> Isso pode levar alguns minutos.</span>
          </div>
          <button className="text-xs font-semibold text-[hsl(258,90%,40%)] hover:underline flex items-center gap-1">
            Detalhes do processamento <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 4 Cards executivos — total = pastas/tópicos registrados no input do Prospeccao */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <ScoreRingCard score={p.score} trend={p.score < 50 ? "down" : "up"} />
        <ProcessingProgressCard processados={p.completos} pendentes={p.pendentes} incompletos={p.incompletos} total={p.total} />
        <PendenciasResumoCard criticas={p.criticas} inconsistencias={p.inconsistencias} faltantes={p.faltantes} />
        <SaudeRelatorioCard documentos={p.docsPct} dadosExtraidos={p.dadosPct} validacoesIA={p.validacoesPct} conformidade={p.dadosPct === 100 ? p.validacoesPct : null} />
      </div>

      {/* KPIs DIP — Completude, Documentos, Pendências, Confiabilidade IA, Kanitz, Health Score */}
      {p.prospecçãoId && (
        <RmaDipKpiCards prospecçãoId={p.prospecçãoId} companyId={p.companyId} scoreFinal={p.score} />
      )}
    </div>
  );
}
