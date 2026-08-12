import type { AuditFinding, ScopeCheckItem, ReportSection, OnDemandContent, BalancoRow, CompanyDataMultiYear, FinancialAnalysis } from "@/types/audit";

export const defaultScopeChecks: ScopeCheckItem[] = [
  // Patrimonial
  { id: "p1", category: "patrimonial", name: "Classificação AC / ANC", description: "Verificar correta classificação entre circulante e não circulante", enabled: true, normReference: "CPC 26" },
  { id: "p2", category: "patrimonial", name: "Classificação PC / PNC", description: "Verificar correta classificação do passivo circulante e não circulante", enabled: true, normReference: "CPC 26" },
  { id: "p3", category: "patrimonial", name: "PL negativo", description: "Identificar patrimônio líquido negativo e implicações de continuidade", enabled: true, normReference: "CPC 26 / NBC TA 570" },
  { id: "p4", category: "patrimonial", name: "Duplicatas descontadas não evidenciadas", description: "Verificar se duplicatas descontadas estão devidamente evidenciadas", enabled: true, normReference: "CPC 48" },
  // Resultado
  { id: "r1", category: "resultado", name: "Reconhecimento de receita (CPC 47)", description: "Verificar critérios dos 5 passos de reconhecimento de receita", enabled: true, normReference: "CPC 47 / IFRS 15" },
  { id: "r2", category: "resultado", name: "Provisões (CPC 25)", description: "Verificar reconhecimento e mensuração de provisões", enabled: true, normReference: "CPC 25 / IAS 37" },
  { id: "r3", category: "resultado", name: "Impairment (CPC 01)", description: "Verificar teste de recuperabilidade de ativos", enabled: true, normReference: "CPC 01 / IAS 36" },
  { id: "r4", category: "resultado", name: "Depreciação (CPC 27)", description: "Verificar taxas e métodos de depreciação", enabled: true, normReference: "CPC 27 / IAS 16" },
  // Fluxo de Caixa
  { id: "f1", category: "fluxo_caixa", name: "Coerência lucro x caixa", description: "Analisar coerência entre lucro líquido e geração de caixa operacional", enabled: true, normReference: "CPC 03" },
  { id: "f2", category: "fluxo_caixa", name: "Classificação DFC", description: "Verificar correta classificação das atividades operacionais, investimento e financiamento", enabled: true, normReference: "CPC 03 / IAS 7" },
];

export const defaultFindings: AuditFinding[] = [];

export const defaultBalancoRows: BalancoRow[] = [];

export const defaultDreRows: BalancoRow[] = [];

export const defaultEntityData: CompanyDataMultiYear = {};

export const defaultFinancialAnalysis: FinancialAnalysis = {
  indicators: {},
  horizontalAnalysis: { rows: [] },
  verticalAnalysis: { rows: [] },
  insolvencyScore: 0,
  insolvencyClassification: "atencao",
  solvencyConclusion: "",
};

export const defaultReportSections: ReportSection[] = [
  { id: "1", title: "Resumo Executivo", content: "A análise das demonstrações financeiras revela conformidade geral com os pronunciamentos contábeis vigentes, com ressalvas pontuais identificadas nos achados técnicos.", includeOpinion: false },
  { id: "2", title: "Escopo e Metodologia", content: "O trabalho foi conduzido com base nas Noprospecções Brasileiras de Contabilidade (NBC TA), abrangendo procedimentos substantivos e de conformidade.", includeOpinion: false },
  { id: "3", title: "Achados e Recomendações", content: "Foram identificados achados técnicos classificados por tipo, risco e impacto. As recomendações visam a correção tempestiva e o fortalecimento dos controles internos.", includeOpinion: true },
  { id: "4", title: "Seção Financeira", content: "Indicadores financeiros, análise horizontal e vertical, índice de insolvência e análise de solvência consolidados.", includeOpinion: true },
  { id: "5", title: "Conclusão", content: "Com base nos procedimentos aplicados e nas evidências obtidas, apresentamos nossa opinião sobre as demonstrações financeiras examinadas.", includeOpinion: true },
];

export const defaultOnDemandContents: OnDemandContent[] = [
  { id: "1", type: "opinion", title: "Parecer Especializado", description: "Opinião técnica detalhada sobre os achados identificados", generated: false },
  { id: "2", type: "conclusion", title: "Conclusão de Auditoria", description: "Conclusão foprospeccaol conforme NBC TA 700/705", generated: false },
  { id: "3", type: "financial_impact", title: "Impactos Financeiros e Compliance", description: "Quantificação dos impactos financeiros e conformidade regulatória", generated: false },
  { id: "4", type: "user_risk", title: "Riscos para Usuários", description: "Análise dos riscos para usuários das demonstrações financeiras", generated: false },
];
