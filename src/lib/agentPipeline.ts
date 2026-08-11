// Arquitetura de Prompts (Nível Produção) — Pipeline em 5 estágios
// Classificador → Extrator Especializado → Validador → Analista → Antifraude

export const PROMPT_CLASSIFICADOR_V2 = `Você é um classificador de documentos financeiros.

Classifique o documento com base no texto OCR:

Classes possíveis:
- PIX
- COMPROVANTE_BANCARIO
- BOLETO
- BALANCETE
- DRE
- NOTA_FISCAL
- DESCONHECIDO

Regras:
- "pix realizado" → PIX
- "comprovante de transação" → COMPROVANTE_BANCARIO
- presença de tabela contábil → BALANCETE ou DRE
- linha digitável → BOLETO

Retorne:
{
  "classe": "",
  "subclasse": "",
  "confianca": 0.0,
  "evidencias": []
}`;

export const PROMPT_EXTRATOR_PIX_V3 = `Você é especialista em análise de PIX.

EXEMPLO REAL:
Entrada OCR: "Pix realizado Valor R$ 10.000,00 Data 02/02/2026 Pagador GERATHERM..."
Saída esperada:
{
  "tipo": "PIX",
  "valor": 10000.00,
  "data": "2026-02-02",
  "pagador": "GERATHERM MEDICAL LATIN AMERICA LTDA"
}

---

AGORA ANALISE. Extraia: valor, data, hora, pagador, destinatario, banco, id.

REGRAS:
- "R$" define valor
- Datas brasileiras (DD/MM/YYYY) → normalizar para YYYY-MM-DD
- Nome em caixa alta geralmente é empresa

SAÍDA JSON:
{
  "tipo": "PIX",
  "valor": 0,
  "data": "",
  "hora": "",
  "pagador": "",
  "destinatario": "",
  "banco": "",
  "id_transacao": "",
  "confianca": 0.0
}`;

export const PROMPT_EXTRATOR_COMPROVANTE_V3 = `Você é especialista em comprovantes bancários.

EXEMPLO:
"Comprovante de Transação Bancária Valor R$ 769,00 Beneficiário FLASH APP"
→
{
  "tipo": "COMPROVANTE_BANCARIO",
  "valor": 769.00,
  "beneficiario": "FLASH APP"
}

---

Extraia: valor, beneficiario, banco, data, identificacao.
Detecte: pagamento vs transferência.

Retorne JSON estruturado com "confianca" (0..1).`;

export const PROMPT_EXTRATOR_BALANCETE_V3 = `Você é contador especialista.

EXEMPLO:
"Receita Bruta 1.294.648,52 Lucro Líquido (83.616,33)"
→
{
  "receita_bruta": 1294648.52,
  "lucro_liquido": -83616.33
}

---

Extraia: receita_bruta, receita_liquida, custos, despesas, lucro_liquido.
Detecte: valores negativos entre parênteses.
Calcule: margem_liquida.

Retorne JSON com "confianca" (0..1).`;

export const PROMPT_VALIDADOR_V1 = `Você é um auditor de dados extraídos.

Entrada: JSON extraído + texto OCR original.

Valide:
1. Valores existem no texto?
2. Datas são válidas?
3. Campos obrigatórios preenchidos?

Corrija se necessário. Se não houver evidência → null.

Retorne:
{
  "valido": true,
  "correcoes": [],
  "confianca": 0.0
}`;

export const PROMPT_ANALISE_V1 = `Você é um analista financeiro.

Com base no JSON estruturado, gere:
- insights
- anomalias
- padrões

Exemplos: valor muito alto, lucro negativo, despesa incomum.

Retorne:
{
  "insights": [],
  "alertas": []
}`;

export const PROMPT_ANTIFRAUDE_V1 = `Você é um detector de fraude financeira.

Analise:
1. Valor fora do padrão
2. Repetição de transações
3. Inconsistência entre documentos
4. Pagador = destinatário

Calcule risco: 0 = baixo, 1 = alto.

Retorne:
{
  "risco": 0.0,
  "motivos": []
}`;

export type PipelineStage = {
  id: string;
  order: number;
  label: string;
  description: string;
  prompt: string;
  recommendedTemp: number;
  outputSchema: string[];
};

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: "CLASSIFICADOR",
    order: 1,
    label: "Classificador Universal",
    description: "Identifica a classe do documento (PIX, BALANCETE, BOLETO, …) e nível de confiança.",
    prompt: PROMPT_CLASSIFICADOR_V2,
    recommendedTemp: 0.0,
    outputSchema: ["classe", "subclasse", "confianca", "evidencias"],
  },
  {
    id: "EXTRATOR_ESPECIFICO",
    order: 2,
    label: "Extrator Especializado",
    description: "Few-shot por classe (PIX_V3, COMPROVANTE_V3, BALANCETE_V3). Extrai os campos estruturados.",
    prompt: PROMPT_EXTRATOR_PIX_V3,
    recommendedTemp: 0.1,
    outputSchema: ["tipo", "valor", "data", "...campos específicos", "confianca"],
  },
  {
    id: "VALIDADOR",
    order: 3,
    label: "Validador (anti-alucinação)",
    description: "Confere cada valor extraído contra o texto OCR. Corrige ou anula campos sem evidência.",
    prompt: PROMPT_VALIDADOR_V1,
    recommendedTemp: 0.0,
    outputSchema: ["valido", "correcoes", "confianca"],
  },
  {
    id: "ANALISE",
    order: 4,
    label: "Analista (insights)",
    description: "Gera insights, anomalias e alertas a partir do JSON validado.",
    prompt: PROMPT_ANALISE_V1,
    recommendedTemp: 0.2,
    outputSchema: ["insights", "alertas"],
  },
  {
    id: "ANTIFRAUDE",
    order: 5,
    label: "Antifraude",
    description: "Detecta padrões suspeitos cruzando documentos. Calcula score de risco 0..1.",
    prompt: PROMPT_ANTIFRAUDE_V1,
    recommendedTemp: 0.0,
    outputSchema: ["risco", "motivos"],
  },
];

export const PIPELINE_CONFIG = {
  pipeline: ["CLASSIFICADOR", "EXTRATOR_ESPECIFICO", "VALIDADOR", "ANALISE", "ANTIFRAUDE"],
  fallback: {
    rule: "if_confianca < 0.6",
    actions: ["reprocessar_com_prompt_generico", "trocar_motor_ocr", "retry_temperatura_menor"],
  },
  score_final: {
    formula: "0.5 * confianca_extracao + 0.3 * confianca_validacao + 0.2 * (1 - risco)",
    fields: ["confianca_extracao", "confianca_validacao", "risco", "score_final"],
  },
};

export const EXTRACTOR_VARIANTS: Record<string, { label: string; prompt: string }> = {
  PIX: { label: "PIX (few-shot v3)", prompt: PROMPT_EXTRATOR_PIX_V3 },
  COMPROVANTE_BANCARIO: { label: "Comprovante bancário (v3)", prompt: PROMPT_EXTRATOR_COMPROVANTE_V3 },
  BALANCETE: { label: "Balancete / DRE (v3)", prompt: PROMPT_EXTRATOR_BALANCETE_V3 },
};
