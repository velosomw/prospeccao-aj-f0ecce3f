// ============================================================
// BS & Dados — Tipos canônicos (Single Source of Truth)
// Conforme BLUEPRINT_BS_Dados_e_Graficos_Auditoria.md
// ============================================================

export interface BSDadosRow {
  mes: string;        // "Março 2024"
  mesKey: string;     // "2024-03"
  // ─ DRE ─
  receita_liquida: number; // sempre POSITIVO
  cmv: number;             // sempre NEGATIVO
  despesas: number;        // sempre NEGATIVO
  resultado: number;       // sinal natural
  // ─ BALANÇO ─
  ativo_circulante: number;
  ativo_nao_circulante: number;
  passivo_circulante: number;
  passivo_nao_circulante: number;
  estoques: number;
  disponivel: number;
  // ─ ENDIVIDAMENTO (componentes em módulo) ─
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  fornecedores: number;
  credores_rj: number;
  divida_total: number;
  // ─ PATRIMÔNIO ─
  patrimonio_liquido: number;
  // ─ VALIDAÇÃO CONTÁBIL (A = P + PL) ─
  ativo_total: number;
  passivo_total: number;
  equilibrio_diff: number;        // |A - (P + PL)|
  equilibrio_diff_pct: number;    // diff / max(A,1)
  equilibrio_ok: boolean;         // diff_pct <= 0.005 (0,5%)
  // ─ FLAGS ─
  hasReceita: boolean;
  hasBalanco: boolean;
  errors: string[];
}

export interface BalanceteEntry {
  fileName: string;
  mesReferencia: string | null; // "YYYY-MM" ou null
}

export interface ParsedRow {
  conta: string;
  descricao: string;
  ref1?: string;
  codigo?: string | null;          // 🚨 código contábil hierárquico (BEx Extenso) — fonte determinística
  values: Record<string, number>;
}

export interface ParsedFinancialData {
  years: string[];           // ex.: ["2024-01","2024-02"]
  dre: ParsedRow[];
  balanco: ParsedRow[];
}

export interface MonthlyDatum {
  mes: string;
  mesKey: string;
  receita_liquida: number;
  cmv: number;
  despesas: number;
  resultado: number;
  ebitda: number;
  depreciacao: number;
  amortizacao: number;
  ativo_circulante: number;
  ativo_nao_circulante: number;
  passivo_circulante: number;
  passivo_nao_circulante: number;
  estoques: number;
  disponivel: number;
  divida_tributaria: number;
  divida_trabalhista: number;
  divida_financeira: number;
  fornecedores: number;
  credores_rj: number;
  outras_obrigacoes: number;
  divida_total: number;
  hasReceita: boolean;
  hasBalanco: boolean;
}
