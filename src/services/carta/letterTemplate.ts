// MD-BEX-PDF-LETTER-PREVIEW-ENGINE-001
// Template Master editorial "Letter_Template_BEx" — layout bloqueado.
// Somente os placeholders são substituídos. Nunca alterar margens, fontes,
// espaçamentos, rodapé, logos ou cores definidos aqui.

export interface LetterData {
  cliente: string;
  sigla?: string;
  contato?: string;
  processo: string;
  data?: string; // se ausente, gerada por extenso a partir de referenceDate
  administrador: string;
  cidade?: string;
  vara?: string;
  tribunal?: string;
  referenceDate?: Date;
}

/** Layout editorial fixo (mm), conforme MD-BEX-PDF-LETTER-PREVIEW-ENGINE-001. */
export const LETTER_LAYOUT = {
  page: { width: 210, height: 297 },
  margin: { top: 35, bottom: 28, left: 25, right: 22 },
  body: {
    sizePt: 12,
    color: "#333333" as const,
    lineHeight: 1.5,
    spaceAfterPt: 6,
    firstLineIndentMm: 12.5, // 1,25 cm
  },
} as const;

export const LETTER_ASSINATURA = {
  nome: "Luiz Rovero",
  empresa: "Brasil Expert",
} as const;

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Data por extenso: "3 de agosto de 2026" (nunca 03/08/2026). */
export function dataPorExtenso(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Blocos do corpo. `bold: true` mantém a ênfase apenas em "Brasil Expert". */
export interface Paragraph {
  text: string;
  indent?: boolean;
}

/** Modelo "Carta Parabenizando" (1 - Modelo_Carta_Parabenizando). */
export const MODELO_PARABENIZANDO: Paragraph[] = [
  {
    text:
      "É com grande satisfação que a Brasil Expert cumprimenta V. Sa. pela nomeação como Administrador Judicial nos autos do processo nº {{processo}}, em trâmite perante a {{vara}} do {{tribunal}}, na comarca de {{cidade}}.",
    indent: true,
  },
  {
    text:
      "A designação reafirma o reconhecimento do mercado e do Poder Judiciário quanto à sua reputação técnica e ao compromisso com a transparência na condução dos processos de reestruturação e recuperação de empresas.",
    indent: true,
  },
  {
    text:
      "A Brasil Expert atua há mais de duas décadas no suporte a administradores judiciais, oferecendo estrutura especializada em auditoria contábil, análise de crédito, elaboração de relatórios mensais de atividades e acompanhamento do cumprimento do plano de recuperação, sempre com rigor metodológico e observância integral à Lei nº 11.101/2005.",
    indent: true,
  },
  {
    text:
      "Colocamo-nos à inteira disposição de {{cliente}} para apresentar nossa metodologia de trabalho e discutir de que forma podemos contribuir com a condução dos trabalhos ao longo do processo.",
    indent: true,
  },
  {
    text: "Renovamos nossos votos de estima e consideração.",
    indent: true,
  },
];

export function fillPlaceholders(text: string, data: LetterData): string {
  const map: Record<string, string> = {
    cliente: data.cliente || "",
    sigla: data.sigla || "",
    contato: data.contato || "",
    processo: data.processo || "",
    data: data.data || dataPorExtenso(data.referenceDate ?? new Date()),
    administrador: data.administrador || "",
    cidade: data.cidade || "",
    vara: data.vara || "",
    tribunal: data.tribunal || "",
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => map[k] ?? "");
}
