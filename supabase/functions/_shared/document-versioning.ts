// Document Versioning — Fase 3
// Cria snapshots imutáveis em document_versions e atualiza document_state como "current".
// Stages: ocr → extracted → validated → cross_validated → consolidated

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type Stage =
  | "ocr"
  | "extracted"
  | "validated"
  | "cross_validated"
  | "consolidated"
  | "failed";

export interface VersionInput {
  document_id: string;
  file_id?: string | null;
  stage: Stage;
  data: Record<string, unknown>;
  classe?: string | null;
  agent?: string | null;
  confidence?: number | null;
  rma_id?: string | null;
  company_id?: string | null;
  status?: string;
  error_message?: string | null;
  created_by?: string | null;
  extracted_data?: Record<string, unknown>;
}

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
}

/** Retorna a próxima versão (max+1) para o documento. */
async function nextVersion(document_id: string): Promise<number> {
  const r = await rest(
    `/document_versions?document_id=eq.${document_id}&select=version&order=version.desc&limit=1`,
  );
  const list = await r.json();
  return (Number(list?.[0]?.version) || 0) + 1;
}

/**
 * Salva snapshot versionado e atualiza document_state com a versão atual.
 * Idempotente em conjunto: cada chamada cria UMA nova versão (append-only).
 */
export async function saveVersion(input: VersionInput): Promise<{ version: number; id: string | null }> {
  const version = await nextVersion(input.document_id);

  const insertResp = await rest(`/document_versions`, {
    method: "POST",
    body: JSON.stringify({
      document_id: input.document_id,
      file_id: input.file_id ?? null,
      version,
      stage: input.stage,
      classe: input.classe ?? null,
      agent: input.agent ?? null,
      confidence: input.confidence ?? null,
      data: input.data,
      created_by: input.created_by ?? null,
    }),
  });

  let versionId: string | null = null;
  if (insertResp.ok) {
    const v = await insertResp.json();
    versionId = v?.[0]?.id ?? null;
  } else {
    console.error("saveVersion insert failed:", await insertResp.text());
  }

  // Upsert document_state
  const stateResp = await rest(
    `/document_state?document_id=eq.${input.document_id}&select=document_id`,
  );
  const exists = (await stateResp.json())?.[0];

  const statePayload: Record<string, unknown> = {
    document_id: input.document_id,
    file_id: input.file_id ?? null,
    rma_id: input.rma_id ?? null,
    company_id: input.company_id ?? null,
    classe: input.classe ?? null,
    agent: input.agent ?? null,
    latest_version: version,
    last_stage: input.stage,
    status: input.status ?? (input.stage === "failed" ? "error" : "ok"),
    confidence: input.confidence ?? null,
    error_message: input.error_message ?? null,
    extracted_data: input.extracted_data ?? input.data,
    updated_at: new Date().toISOString(),
  };

  if (exists) {
    await rest(`/document_state?document_id=eq.${input.document_id}`, {
      method: "PATCH",
      body: JSON.stringify(statePayload),
    });
  } else {
    await rest(`/document_state`, {
      method: "POST",
      body: JSON.stringify(statePayload),
    });
  }

  return { version, id: versionId };
}

/** Última versão de um stage específico para um documento. */
export async function getLatestStage(document_id: string, stage: Stage) {
  const r = await rest(
    `/document_versions?document_id=eq.${document_id}&stage=eq.${stage}&order=version.desc&limit=1&select=*`,
  );
  return (await r.json())?.[0] ?? null;
}
