// Cross Validate — Fase 3
// POST /cross-validate { rma_id?, company_id?, ano?, mes?, persist?: boolean }
//   Roda o validador cross-doc 2.0 e (opcional) persiste o resultado como
//   versão `cross_validated` no documento agregador (ou em todos os docs do escopo).

import { runCrossValidation } from "../_shared/cross-validator.ts";
import { saveVersion } from "../_shared/document-versioning.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sb(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) return [];
  return (await r.json()) ?? [];
}

async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_KEY,
      },
    });
    if (!r.ok) return null;
    return (await r.json())?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { rma_id, company_id, ano, mes, persist = false } = body ?? {};

    if (!rma_id && !company_id) {
      return new Response(
        JSON.stringify({ error: "rma_id ou company_id obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await runCrossValidation({ rma_id, company_id, ano, mes });
    const userId = await getUserId(req);
    let persistedVersions = 0;

    // Persistência opcional: cria snapshot cross_validated em cada documento do RMA
    if (persist && rma_id) {
      const docs: any[] = await sb(
        `/pipeline_documents?rma_id=eq.${encodeURIComponent(rma_id)}&select=id,external_id&limit=500`,
      );
      for (const d of docs) {
        const ok = await saveVersion({
          document_id: d.id,
          file_id: d.external_id ?? null,
          stage: "cross_validated",
          classe: "cross_doc",
          confidence: result.score,
          rma_id,
          status: result.passed ? "ok" : "review",
          created_by: userId,
          data: {
            score: result.score,
            passed: result.passed,
            issues: result.issues,
            summary: result.summary,
            checked: result.checked,
          },
        }).catch((e) => { console.error("saveVersion cross failed:", e); return null; });
        if (ok) persistedVersions++;
      }
    }

    // Sempre registra o run no histórico (mesmo sem persist=true)
    let runId: string | null = null;
    if (company_id) {
      const insert = await sb(`/cross_validation_runs`, {
        method: "POST",
        body: JSON.stringify({
          company_id,
          rma_id: rma_id ?? null,
          ano: ano ?? null,
          mes: mes ?? null,
          score: result.score,
          passed: result.passed,
          checked: result.checked,
          issues: result.issues,
          summary: result.summary,
          persisted_versions: persistedVersions,
          triggered_by: userId,
        }),
      });
      runId = (insert as any)?.[0]?.id ?? null;
    }

    return new Response(JSON.stringify({ ...result, run_id: runId, persisted_versions: persistedVersions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cross-validate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
