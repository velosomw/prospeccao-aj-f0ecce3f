// ============================================================
// REF1_MAP — Mapeamento "Ref Capital" BEX → campo BSDadosRow
// 47 chaves cobertas. Refs sem mapeamento direto entram em
// agregadores (ativo_circulante, passivo_circulante).
// ============================================================
import type { BSDadosRow } from "./types";

type BSField = keyof BSDadosRow;

export const REF1_MAP: Record<string, BSField> = {
  // 🔵 Ativo Circulante (componentes detalhados)
  A: "disponivel",
  B: "disponivel",
  D: "estoques",

  // 🟠 Passivo Circulante
  AA: "divida_financeira",
  BB: "fornecedores",
  CC: "divida_trabalhista",
  DD: "divida_tributaria",
  II: "credores_rj",
  LL: "credores_rj",
  II1: "divida_tributaria",

  // 🔴 Passivo Não Circulante
  PP: "fornecedores",
  QQ: "divida_financeira",
  RR: "divida_tributaria",
  CC1: "credores_rj",
};

// Refs do Ativo Circulante (para totalização derivada)
export const AC_REFS = new Set([
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O",
]);

// Refs do Passivo Circulante (para totalização derivada)
export const PC_REFS = new Set([
  "AA", "BB", "CC", "DD", "EE", "FF", "GG", "HH",
  "II", "JJ", "KK", "LL", "MM", "NN", "OO", "II1",
]);

// Refs do Ativo Não Circulante
export const ANC_REFS = new Set([
  "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1", "I1", "J1",
]);

// Refs do Passivo Não Circulante
export const PNC_REFS = new Set([
  "PP", "QQ", "RR", "SS", "TT", "UU", "VV", "WW", "XX", "YY", "ZZ",
  "A1B", "B1B", "C1", "D1B", "E1B", "F1B", "AA1", "BB1", "CC1", "DD1", "EE1", "FF1",
]);

// Componentes da dívida total
export const DIVIDA_FIELDS: BSField[] = [
  "divida_tributaria",
  "divida_trabalhista",
  "divida_financeira",
  "fornecedores",
  "credores_rj",
];

// Padrões fallback (regex) quando ref1 ausente
export const FALLBACK_PATTERNS: Record<string, RegExp> = {
// (definido abaixo) — placeholder para evitar duplicação
} as Record<string, RegExp>;

// ============================================================
// REF_BY_PREFIX — Mapeamento por código contábil hierárquico (BEx)
// Resolve direto do `Extenso` do balancete, sem depender de ref1
// nem de regex sobre descrição. Determinístico e auditável.
// Ordem importa: prefixos mais específicos PRIMEIRO.
// ============================================================
export const REF_BY_PREFIX: Array<[RegExp, BSField]> = [
  // ── Ativo Circulante ──
  [/^11101/, "disponivel"],          // Caixa e Equivalentes
  [/^11104/, "disponivel"],          // Aplicações Financeiras
  [/^113/,   "estoques"],            // Estoques
  // ── Passivo Circulante ──
  [/^2141/,  "divida_tributaria"],   // Tributário parcelado (mais específico antes)
  [/^211/,   "divida_financeira"],   // Empréstimos
  [/^212/,   "fornecedores"],        // Fornecedores
  [/^213/,   "divida_trabalhista"],  // Encargos trabalhistas
  [/^214/,   "divida_tributaria"],   // Tributárias
  [/^218/,   "credores_rj"],         // Credores RJ
  // ── Passivo Não Circulante ──
  [/^221/,   "divida_financeira"],   // Empréstimos LP
  [/^2241/,  "divida_tributaria"],   // Tributário parcelado LP
];

export function mapCodigoToField(codigo: string | null | undefined): BSField | null {
  if (!codigo) return null;
  const c = String(codigo).trim();
  if (!/^\d+$/.test(c)) return null;
  for (const [rx, field] of REF_BY_PREFIX) if (rx.test(c)) return field;
  return null;
}

// Classificação totalizadora por prefixo do primeiro/segundo dígito
export function classifyAggByCodigo(codigo: string | null | undefined): BSField | null {
  if (!codigo) return null;
  const c = String(codigo).trim();
  if (!/^\d+$/.test(c)) return null;
  if (c.startsWith("11")) return "ativo_circulante";
  if (c.startsWith("12")) return "ativo_nao_circulante";
  if (c.startsWith("21")) return "passivo_circulante";
  if (c.startsWith("22")) return "passivo_nao_circulante";
  if (c.startsWith("3"))  return "patrimonio_liquido";
  return null;
}

// (Re)Definição efetiva dos padrões fallback regex
Object.assign(FALLBACK_PATTERNS, {
  receita_liquida:
    /\breceita\s*(?:operacional\s*)?l[ií]quid|\bvenda.*l[ií]quid\b|\breceita\s+de\s+vendas/i,
  cmv: /\bc(?:mv|sv|pv)\b|\bcusto\s+(?:das?\s+)?(?:mercadoria|servi[cç]o|produto|venda)/i,
  despesas: /\bdespesa|gasto\s+oper|despesas?\s+(?:gerais|administrativas|comerciais)/i,
  resultado: /\bresultado\s+(?:l[ií]quido|do\s+exerc[ií]cio|operacional)|\blucro\s+l[ií]quido|\bpreju[ií]zo/i,
  estoques: /\bestoque|mercadoria\s+em\s+estoque|produtos?\s+acabados?/i,
  disponivel: /\b(caixa|banco|aplica[cç][oõ]es?\s+financeiras?|disponibilidades?)\b/i,
  divida_financeira: /\bempr[eé]stimo|financiamento|debênture/i,
  divida_tributaria: /\b(impostos?|tributos?|icms|pis|cofins|iss|irpj|csll|inss).*(?:a\s+pagar|recolher|parcelad)/i,
  divida_trabalhista: /\b(sal[aá]rios?|f[eé]rias|13[oº]|fgts|inss\s+empregad|encargos\s+trabalhistas)/i,
  fornecedores: /\bfornecedores?\b/i,
  credores_rj: /\bcredores?\s+(da\s+)?recupera[cç][aã]o|\bcredores?\s+rj\b/i,
  ativo_circulante: /\bativo\s+circulante\b/i,
  passivo_circulante: /\bpassivo\s+circulante\b/i,
  ativo_nao_circulante: /\bativo\s+n[aã]o\s+circulante|realiz[aá]vel\s+(a\s+)?longo\s+prazo/i,
  passivo_nao_circulante: /\bpassivo\s+n[aã]o\s+circulante|exig[ií]vel\s+(a\s+)?longo\s+prazo/i,
  patrimonio_liquido: /\bpatrim[oô]nio\s+l[ií]quido\b|\bcapital\s+social\b|\breservas?\s+de\s+(lucros?|capital)\b|\blucros?\s+acumulad/i,
});

