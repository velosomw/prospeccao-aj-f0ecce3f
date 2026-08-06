// MD-ENTERPRISE-KNOWLEDGE-REGISTRY-001 — API Corporativa de Conhecimento
// Ações: getCompany, getProcess, getAJ, getJudge, getKnowledge, searchKnowledge,
//        getTimeline, getBusinessHistory, getIndicators, ingest (motores certificados)
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ingestWorkspace, slug } from "../_shared/knowledge-registry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  if (token === SERVICE_KEY) return { id: null, service: true };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, service: false };
}

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D+/g, "");

async function findEntity(tipo: string, key: string) {
  const chave = tipo === "empresa" || tipo === "processo"
    ? (onlyDigits(key) || slug(key))
    : slug(key);
  const { data } = await admin.from("knowledge_entities").select("*")
    .eq("tipo", tipo).eq("chave_natural", chave).maybeSingle();
  if (data) return data;
  const { data: byName } = await admin.from("knowledge_entities").select("*")
    .eq("tipo", tipo).ilike("nome", `%${key}%`).limit(1);
  return byName?.[0] ?? null;
}

async function fullKnowledge(entityId: string) {
  const [entity, versions, relOut, relIn, events, commercial, sources] = await Promise.all([
    admin.from("knowledge_entities").select("*").eq("id", entityId).maybeSingle(),
    admin.from("knowledge_entity_versions").select("*").eq("entity_id", entityId).order("versao", { ascending: false }),
    admin.from("knowledge_relations").select("*, to:knowledge_entities!knowledge_relations_to_entity_id_fkey(id,tipo,nome,chave_natural)").eq("from_entity_id", entityId),
    admin.from("knowledge_relations").select("*, from:knowledge_entities!knowledge_relations_from_entity_id_fkey(id,tipo,nome,chave_natural)").eq("to_entity_id", entityId),
    admin.from("knowledge_events").select("*").eq("entity_id", entityId).order("data_evento", { ascending: true }),
    admin.from("knowledge_commercial").select("*").eq("entity_id", entityId).order("versao", { ascending: false }),
    admin.from("knowledge_sources").select("*").eq("entity_id", entityId).order("created_at", { ascending: false }),
  ]);
  return {
    entidade: entity.data,
    historico: versions.data ?? [],
    relacionamentos: { saida: relOut.data ?? [], entrada: relIn.data ?? [] },
    timeline: events.data ?? [],
    comercial: commercial.data ?? [],
    origem: sources.data ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);

    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const action = String(body.action ?? url.searchParams.get("action") ?? "");
    const key = String(body.key ?? url.searchParams.get("key") ?? "");
    const entityId = String(body.entity_id ?? url.searchParams.get("entity_id") ?? "");

    switch (action) {
      case "getCompany":
      case "getProcess":
      case "getAJ":
      case "getJudge": {
        const tipo = { getCompany: "empresa", getProcess: "processo", getAJ: "pessoa_aj", getJudge: "pessoa_magistrado" }[action]!;
        if (!key) return json({ error: "key obrigatório" }, 400);
        const e = await findEntity(tipo, key);
        if (!e) return json({ found: false }, 200);
        return json({ found: true, ...(await fullKnowledge(e.id)) });
      }

      case "getKnowledge": {
        if (!entityId) return json({ error: "entity_id obrigatório" }, 400);
        return json(await fullKnowledge(entityId));
      }

      case "searchKnowledge": {
        const { data, error } = await admin.rpc("knowledge_search", {
          p_query: String(body.query ?? url.searchParams.get("query") ?? ""),
          p_tipo: body.tipo ?? url.searchParams.get("tipo") ?? null,
          p_limit: Number(body.limit ?? 50),
        });
        if (error) return json({ error: error.message }, 400);
        return json({ results: data ?? [] });
      }

      case "getTimeline": {
        if (!entityId) return json({ error: "entity_id obrigatório" }, 400);
        const { data } = await admin.from("knowledge_events").select("*")
          .eq("entity_id", entityId).order("data_evento", { ascending: true });
        return json({ timeline: data ?? [] });
      }

      case "getBusinessHistory": {
        if (!entityId) return json({ error: "entity_id obrigatório" }, 400);
        const { data } = await admin.from("knowledge_commercial").select("*")
          .eq("entity_id", entityId).order("versao", { ascending: false });
        return json({ historico_comercial: data ?? [] });
      }

      case "getIndicators": {
        const { data, error } = await admin.rpc("knowledge_indicators");
        if (error) return json({ error: error.message }, 400);
        return json({ indicadores: data });
      }

      case "ingest": {
        // Segurança: conhecimento consolidado nunca é editado manualmente —
        // só motores certificados (service role) podem gravar.
        if (!user.service) return json({ error: "Somente motores certificados podem gravar conhecimento" }, 403);
        const result = await ingestWorkspace(body.workspace ?? {}, body.origem ?? {});
        return json({ ok: Boolean(result), ...result });
      }

      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[knowledge-registry]", msg);
    return json({ error: msg }, 500);
  }
});
