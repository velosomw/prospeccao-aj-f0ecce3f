// Regras de processamento, análise e finalização independentes
// para cada tipo de documento Prospeccao dentro do workspace.
//
// - Parecer Técnico Contábil: documento PERICIAL — exige rigor alto
//   (todas as seções aprovadas) e gera o "Parecer Final" em .docx.
// - Prospeccao Mensal (CNJ 72/2020): documento de ACOMPANHAMENTO — pode ser
//   emitido com dados parciais; gera o "Prospeccao Final" em .docx.

export type RmaDocTipo = "parecer_tecnico" | "prospeccao_mensal";

export interface RmaDocRules {
  tipo: RmaDocTipo;
  label: string;
  finalLabel: string;
  finalFileLabel: string;
  /** % mínima de seções aprovadas/concluídas para autogerar o documento final */
  minPctAutoFinal: number;
  /** % mínima para considerar o documento "finalizável" manualmente */
  minPctManualFinal: number;
  /** Exige aprovação por Coordenador antes de consolidar */
  requireCoordinatorApproval: boolean;
  /** Permite finalizar com seções pendentes (parcial) */
  allowPartialFinalize: boolean;
  /** Tom da geração de IA por seção */
  aiTone: "pericial" | "descritivo";
  /** Frequência esperada de emissão */
  cadence: "pontual" | "mensal";
  description: string;
}

export const Prospeccao_DOC_RULES: Record<RmaDocTipo, RmaDocRules> = {
  parecer_tecnico: {
    tipo: "parecer_tecnico",
    label: "Parecer Técnico Contábil",
    finalLabel: "Parecer Técnico Final",
    finalFileLabel: "Parecer Técnico Final (.docx)",
    minPctAutoFinal: 100,
    minPctManualFinal: 90,
    requireCoordinatorApproval: true,
    allowPartialFinalize: false,
    aiTone: "pericial",
    cadence: "pontual",
    description:
      "Documento pericial. Exige aprovação do Coordenador em todas as seções e só é emitido como Parecer Final quando 100% aprovado.",
  },
  prospeccao_mensal: {
    tipo: "prospeccao_mensal",
    label: "Relatório Mensal de Atividades (CNJ 72/2020)",
    finalLabel: "Prospeccao Final",
    finalFileLabel: "Prospeccao Final (.docx)",
    minPctAutoFinal: 70,
    minPctManualFinal: 50,
    requireCoordinatorApproval: false,
    allowPartialFinalize: true,
    aiTone: "descritivo",
    cadence: "mensal",
    description:
      "Relatório de acompanhamento mensal. Pode ser emitido com dados parciais (a partir de 70% das seções) e atualizado incrementalmente ao longo do mês.",
  },
};

export function getProspeccaoDocRules(tipo: string): RmaDocRules {
  return Prospeccao_DOC_RULES[(tipo as RmaDocTipo)] ?? Prospeccao_DOC_RULES.parecer_tecnico;
}
