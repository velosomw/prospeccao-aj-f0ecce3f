// Persistência canônica de Business Facts (modelo chave-valor tipado / EAV)
// Tabela: public.prospeccao_business_facts
import { CANONICAL_SCHEMA_VERSION } from "./canonical-schema.ts";

export interface FactContext {
  linha_id?: string | null;
  workspace_id?: string | null;
  document_id?: string | null;
  numero_processo?: string | null;
  cnpj?: string | null;
  source?: string | null;
}

interface FactRow {
  linha_id: string | null;
  workspace_id: string | null;
  document_id: string | null;
  numero_processo: string | null;
  cnpj: string | null;
  fact_key: string;
  fact_type: string;
  value_text: string | null;
  value_numeric: number | null;
  value_date: string | null;
  value_json: unknown | null;
  unit: string | null;
  confidence: number | null;
  source: string | null;
  evidence_snippet: string | null;
  schema_version: string;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Converte o workspace normalizado em linhas canônicas de fatos. */
export function buildFactRows(ws: Record<string, any>, ctx: FactContext): FactRow[] {
  const base = {
    linha_id: ctx.linha_id ?? null,
    workspace_id: ctx.workspace_id ?? null,
    document_id: ctx.document_id ?? null,
    numero_processo: ctx.numero_processo ?? ws?.processo ?? null,
    cnpj: ctx.cnpj ?? null,
    schema_version: CANONICAL_SCHEMA_VERSION,
    source: ctx.source ?? "gemini_extraction",
  };

  const rows: FactRow[] = [];
  const evid: any[] = Array.isArray(ws?.evidencias) ? ws.evidencias : [];
  const snippetFor = (campo: string) =>
    evid.find((e) => String(e?.campo ?? "").toLowerCase() === campo.toLowerCase())?.trecho ?? null;

  // Fatos monetários vindos do bloco business_facts
  const facts: any[] = Array.isArray(ws?.business_facts) ? ws.business_facts : [];
  for (const f of facts) {
    if (!f || typeof f !== "object") continue;
    const key = String(f.tipo ?? "").trim();
    if (!key) continue;
    rows.push({
      ...base,
      fact_key: key,
      fact_type: "money",
      value_text: null,
      value_numeric: num(f.valor),
      value_date: null,
      value_json: f.pagina != null ? { pagina: f.pagina } : null,
      unit: f.moeda ?? "BRL",
      confidence: num(f.confianca),
      source: f.origem ?? base.source,
      evidence_snippet: snippetFor(key),
    });
  }

  // Fatos escalares do workspace
  const scalars: Array<[string, unknown, string]> = [
    ["empresa", ws?.empresa, "text"],
    ["tipo_processo", ws?.tipo_processo, "text"],
    ["fase", ws?.fase, "text"],
    ["vara", ws?.vara, "text"],
    ["comarca", ws?.comarca, "text"],
    ["estado", ws?.estado, "text"],
    ["administrador_judicial", ws?.administrador_judicial, "text"],
    ["juiz", ws?.juiz, "text"],
    ["natureza_valor", ws?.natureza_valor, "text"],
    ["valor_exportacao", ws?.valor_exportacao, "money"],
    ["score_confianca", ws?.score_confianca, "number"],
    ["score_comercial", ws?.score_comercial?.score_geral, "number"],
  ];

  for (const [key, value, type] of scalars) {
    if (value === null || value === undefined || value === "") continue;
    rows.push({
      ...base,
      fact_key: key,
      fact_type: type,
      value_text: type === "text" ? String(value) : null,
      value_numeric: type === "text" ? null : num(value),
      value_date: null,
      value_json: null,
      unit: type === "money" ? "BRL" : null,
      confidence: num(ws?.score_confianca),
      source: base.source,
      evidence_snippet: snippetFor(key),
    });
  }

  // Empresas relacionadas como fatos estruturados
  const rel: any[] = Array.isArray(ws?.empresas_relacionadas) ? ws.empresas_relacionadas : [];
  for (const r of rel) {
    if (!r || typeof r !== "object") continue;
    rows.push({
      ...base,
      fact_key: "empresa_relacionada",
      fact_type: "json",
      value_text: r.nome ?? null,
      value_numeric: null,
      value_date: null,
      value_json: r,
      unit: null,
      confidence: null,
      source: base.source,
      evidence_snippet: null,
    });
  }

  return rows;
}

/** Grava os fatos canônicos. Best-effort: erros são logados, não quebram o pipeline. */
export async function persistBusinessFacts(
  admin: any,
  ws: Record<string, any>,
  ctx: FactContext,
): Promise<number> {
  const rows = buildFactRows(ws, ctx);
  if (rows.length === 0) return 0;
  try {
    if (ctx.linha_id) {
      await admin.from("prospeccao_business_facts").delete().eq("linha_id", ctx.linha_id);
    }
    const { error } = await admin.from("prospeccao_business_facts").insert(rows);
    if (error) throw error;
    return rows.length;
  } catch (e) {
    console.error("[business-facts] persist failed:", e);
    return 0;
  }
}
