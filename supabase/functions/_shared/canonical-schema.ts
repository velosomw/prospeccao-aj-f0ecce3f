// MD-GEMINI-LIVE-PROCESSING-CERTIFICATION-001
// JSON Canônico — versionamento + validação estrita do payload retornado pelo Gemini.
// Política: JSON inválido é REJEITADO (não persiste) e a linha é marcada com erro.

export const CANONICAL_SCHEMA_VERSION = "1.0.0";

export interface ValidationIssue {
  path: string;
  rule: string;
  message: string;
}

export interface CanonicalValidation {
  valid: boolean;
  schema_version: string;
  issues: ValidationIssue[];
  normalized: Record<string, unknown> | null;
}

const TIPOS_PROCESSO = [
  "Recuperação Judicial",
  "Recuperação Extrajudicial",
  "Pedido de Falência",
  "Falência",
  "Autofalência",
  "Execução",
  "Outro",
];
/** Normaliza variações textuais do Gemini para o vocabulário canônico. */
function normalizeTipoProcesso(v: unknown): string | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const k = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (k.includes("extrajud")) return "Recuperação Extrajudicial";
  if (k.includes("recuperacao")) return "Recuperação Judicial";
  if (k.includes("autofalencia")) return "Autofalência";
  if (k.includes("pedido") && k.includes("falencia")) return "Pedido de Falência";
  if (k.includes("falencia")) return "Falência";
  if (k.includes("execucao")) return "Execução";
  return TIPOS_PROCESSO.find((t) => t.toLowerCase() === raw.toLowerCase()) ?? "Outro";
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Valida o JSON canônico extraído. Retorna `normalized` apenas quando válido.
 */
export function validateCanonical(extracted: unknown): CanonicalValidation {
  const issues: ValidationIssue[] = [];
  const root = (extracted ?? {}) as Record<string, any>;

  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return {
      valid: false,
      schema_version: CANONICAL_SCHEMA_VERSION,
      issues: [{ path: "$", rule: "type", message: "Payload não é um objeto JSON" }],
      normalized: null,
    };
  }

  const ws = (root.workspace ?? {}) as Record<string, any>;
  if (!ws || typeof ws !== "object" || Object.keys(ws).length === 0) {
    issues.push({ path: "workspace", rule: "required", message: "Bloco 'workspace' ausente ou vazio" });
  }

  if (!isNonEmptyString(ws.processo) && !isNonEmptyString(ws.empresa)) {
    issues.push({
      path: "workspace.processo|empresa",
      rule: "required",
      message: "É obrigatório identificar ao menos o número do processo ou a empresa",
    });
  }

  if (ws.tipo_processo !== undefined && ws.tipo_processo !== null) {
    ws.tipo_processo = normalizeTipoProcesso(ws.tipo_processo);
  }

  const valor = toNumberOrNull(ws.valor_exportacao);
  if (ws.valor_exportacao !== undefined && ws.valor_exportacao !== null && valor === null) {
    issues.push({ path: "workspace.valor_exportacao", rule: "number", message: "valor_exportacao não numérico" });
  }
  if (valor !== null && valor < 0) {
    issues.push({ path: "workspace.valor_exportacao", rule: "range", message: "valor_exportacao negativo" });
  }

  const score = toNumberOrNull(ws.score_confianca);
  if (score !== null && (score < 0 || score > 100)) {
    issues.push({ path: "workspace.score_confianca", rule: "range", message: "score_confianca fora de 0–100" });
  }

  for (const key of ["empresas_relacionadas", "business_facts", "evidencias", "alertas", "proximos_eventos"]) {
    if (ws[key] !== undefined && ws[key] !== null && !Array.isArray(ws[key])) {
      issues.push({ path: `workspace.${key}`, rule: "type", message: `${key} deve ser uma lista` });
    }
  }

  const facts = Array.isArray(ws.business_facts) ? ws.business_facts : [];
  facts.forEach((f: any, i: number) => {
    if (!f || typeof f !== "object") {
      issues.push({ path: `workspace.business_facts[${i}]`, rule: "type", message: "fato não é objeto" });
      return;
    }
    if (!isNonEmptyString(f.tipo)) {
      issues.push({ path: `workspace.business_facts[${i}].tipo`, rule: "required", message: "tipo do fato ausente" });
    }
    if (f.valor !== undefined && f.valor !== null && toNumberOrNull(f.valor) === null) {
      issues.push({ path: `workspace.business_facts[${i}].valor`, rule: "number", message: "valor não numérico" });
    }
  });

  if (issues.length > 0) {
    return { valid: false, schema_version: CANONICAL_SCHEMA_VERSION, issues, normalized: null };
  }

  const normalized = {
    ...root,
    schema_version: CANONICAL_SCHEMA_VERSION,
    workspace: {
      ...ws,
      valor_exportacao: valor,
      score_confianca: score,
      business_facts: facts.map((f: any) => ({ ...f, valor: toNumberOrNull(f.valor) })),
    },
  };

  return { valid: true, schema_version: CANONICAL_SCHEMA_VERSION, issues: [], normalized };
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.path}: ${i.message}`).join("; ");
}
