// MD-ENTERPRISE-KNOWLEDGE-REGISTRY-001
// Camada corporativa de conhecimento: consolida Business Facts em entidades,
// relacionamentos, eventos e indicadores comerciais — com histórico e rastreabilidade.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export type EntityType =
  | "empresa" | "pessoa_aj" | "pessoa_magistrado" | "pessoa_advogado"
  | "credor" | "grupo_economico" | "processo" | "comarca" | "vara" | "tribunal";

export interface Origem {
  document_id?: string | null;
  registry_id?: string | null;
  business_fact?: Record<string, unknown>;
  hash_sha256?: string | null;
  motor_ia?: string | null;
  confiabilidade?: number | null;
  user_id?: string | null;
}

export function slug(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D+/g, "");

export async function upsertEntity(args: {
  tipo: EntityType;
  chave: string;
  nome: string;
  dados?: Record<string, unknown>;
  origem?: Origem;
  uf?: string | null;
  municipio?: string | null;
  tribunal?: string | null;
  situacao?: string | null;
  confiabilidade?: number | null;
  projeto?: string;
}): Promise<string | null> {
  if (!args.chave || !args.nome) return null;
  const { data, error } = await admin.rpc("knowledge_upsert_entity", {
    p_tipo: args.tipo,
    p_chave: args.chave,
    p_nome: args.nome,
    p_dados: args.dados ?? {},
    p_origem: args.origem ?? {},
    p_uf: args.uf ?? null,
    p_municipio: args.municipio ?? null,
    p_tribunal: args.tribunal ?? null,
    p_situacao: args.situacao ?? null,
    p_confiabilidade: args.confiabilidade ?? null,
    p_projeto: args.projeto ?? "orange_ai",
  });
  if (error) { console.error("[knowledge] upsert falhou:", error.message); return null; }
  return data as string;
}

export async function relate(from: string | null, to: string | null, tipo: string, atributos: Record<string, unknown> = {}) {
  if (!from || !to || from === to) return;
  const { error } = await admin.from("knowledge_relations")
    .upsert({ from_entity_id: from, to_entity_id: to, tipo, atributos },
            { onConflict: "from_entity_id,to_entity_id,tipo" });
  if (error) console.error("[knowledge] relate falhou:", error.message);
}

async function sha(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function addEvent(entityId: string | null, ev: {
  tipo: string; data_evento?: string | null; descricao?: string | null;
  dados?: Record<string, unknown>; origem?: Origem;
}) {
  if (!entityId || !ev.tipo) return;
  const hash = await sha(`${entityId}|${ev.tipo}|${ev.data_evento ?? ""}|${ev.descricao ?? ""}`);
  const { error } = await admin.from("knowledge_events").upsert({
    entity_id: entityId, tipo: ev.tipo, data_evento: ev.data_evento || null,
    descricao: ev.descricao || null, dados: ev.dados ?? {}, origem: ev.origem ?? {},
    hash_evento: hash,
  }, { onConflict: "entity_id,hash_evento" });
  if (error) console.error("[knowledge] evento falhou:", error.message);
}

export async function setCommercial(entityId: string | null, c: Record<string, unknown>) {
  if (!entityId) return;
  const { data: prev } = await admin.from("knowledge_commercial")
    .select("versao").eq("entity_id", entityId).order("versao", { ascending: false }).limit(1);
  const versao = (Number(prev?.[0]?.versao) || 0) + 1;
  const { error } = await admin.from("knowledge_commercial").insert({
    entity_id: entityId,
    prioridade: (c.prioridade as string) ?? null,
    complexidade: (c.complexidade as string) ?? null,
    potencial_economico: (c.potencial_economico as number) ?? null,
    probabilidade_aj: (c.probabilidade_aj as number) ?? null,
    interesse_bex: (c.interesse_bex as number) ?? null,
    situacao_comercial: (c.situacao_comercial as string) ?? null,
    dados: c, versao,
  });
  if (error) console.error("[knowledge] comercial falhou:", error.message);
}

/**
 * Consolida um workspace extraído pelo Gemini em conhecimento corporativo.
 * Nunca apaga histórico — cada reprocessamento gera nova versão.
 */
export async function ingestWorkspace(ws: Record<string, any>, origem: Origem = {}) {
  try {
    const projeto = "orange_ai";
    const numero = String(ws.processo ?? "").trim();
    const empresaNome = String(ws.empresa ?? "").trim();
    const cnpj = onlyDigits(ws.cnpj ?? ws.cnpj_empresa);

    const empresaId = empresaNome
      ? await upsertEntity({
          tipo: "empresa", chave: cnpj || slug(empresaNome), nome: empresaNome, projeto,
          uf: ws.estado ?? null, municipio: ws.comarca ?? null,
          situacao: ws.situacao_processo ?? ws.fase_processual ?? null,
          confiabilidade: ws.score_confianca ?? null,
          dados: {
            razao_social: empresaNome, nome_fantasia: ws.nome_fantasia ?? null,
            cnpj: cnpj || null, segmento: ws.segmento ?? null,
            grupo_economico: ws.grupo_economico ?? null,
            estado: ws.estado ?? null, cidade: ws.comarca ?? null,
          },
          origem,
        })
      : null;

    const processoId = numero
      ? await upsertEntity({
          tipo: "processo", chave: onlyDigits(numero) || slug(numero), nome: numero, projeto,
          uf: ws.estado ?? null, municipio: ws.comarca ?? null, tribunal: ws.tribunal ?? null,
          situacao: ws.situacao_processo ?? ws.fase_processual ?? null,
          confiabilidade: ws.score_confianca ?? null,
          dados: {
            numero_cnj: numero, classe: ws.classe_judicial ?? null,
            tipo: ws.tipo_processo ?? null, fase: ws.fase_processual ?? null,
            valor: ws.valor_exportacao ?? null, vara: ws.vara ?? null,
            comarca: ws.comarca ?? null, tribunal: ws.tribunal ?? null,
            data_distribuicao: ws.data_distribuicao ?? null,
            ultimo_evento: ws.ultimo_evento ?? null,
            empresa: empresaNome || null,
            administrador_judicial: ws.administrador_judicial ?? null,
            magistrado: ws.juiz ?? null,
            resumo_executivo: ws.resumo_executivo ?? null,
          },
          origem,
        })
      : null;

    const ajId = ws.administrador_judicial
      ? await upsertEntity({
          tipo: "pessoa_aj", chave: slug(ws.administrador_judicial),
          nome: String(ws.administrador_judicial), projeto,
          uf: ws.estado ?? null, dados: { tipo: "administrador_judicial", empresa_aj: ws.escritorio_aj ?? null },
          origem,
        })
      : null;

    const juizId = ws.juiz
      ? await upsertEntity({
          tipo: "pessoa_magistrado", chave: slug(ws.juiz), nome: String(ws.juiz), projeto,
          uf: ws.estado ?? null, tribunal: ws.tribunal ?? null,
          dados: { tipo: "magistrado", vara: ws.vara ?? null, comarca: ws.comarca ?? null },
          origem,
        })
      : null;

    const grupoId = ws.grupo_economico
      ? await upsertEntity({
          tipo: "grupo_economico", chave: slug(ws.grupo_economico),
          nome: String(ws.grupo_economico), projeto, dados: {}, origem,
        })
      : null;

    const comarcaId = ws.comarca
      ? await upsertEntity({
          tipo: "comarca", chave: slug(`${ws.comarca}-${ws.estado ?? ""}`),
          nome: String(ws.comarca), projeto, uf: ws.estado ?? null, dados: {}, origem,
        })
      : null;

    const varaId = ws.vara
      ? await upsertEntity({
          tipo: "vara", chave: slug(`${ws.vara}-${ws.comarca ?? ""}-${ws.estado ?? ""}`),
          nome: String(ws.vara), projeto, uf: ws.estado ?? null,
          municipio: ws.comarca ?? null, tribunal: ws.tribunal ?? null, dados: {}, origem,
        })
      : null;

    await relate(empresaId, processoId, "participa");
    await relate(processoId, ajId, "possui_aj");
    await relate(processoId, juizId, "possui_magistrado");
    await relate(empresaId, grupoId, "pertence_grupo");
    await relate(processoId, varaId, "tramita_em");
    await relate(varaId, comarcaId, "tramita_em");

    for (const c of (Array.isArray(ws.credores) ? ws.credores : [])) {
      const nome = typeof c === "string" ? c : c?.nome;
      if (!nome) continue;
      const credorId = await upsertEntity({
        tipo: "credor", chave: slug(nome), nome: String(nome), projeto,
        dados: typeof c === "object" ? c : {}, origem,
      });
      await relate(credorId, processoId, "credor_de",
        typeof c === "object" ? { valor: c?.valor ?? null, classe: c?.classe ?? null } : {});
    }

    // Eventos processuais cronológicos
    const eventos = Array.isArray(ws.eventos) ? ws.eventos
      : Array.isArray(ws.linha_do_tempo) ? ws.linha_do_tempo : [];
    for (const ev of eventos) {
      await addEvent(processoId, {
        tipo: String(ev?.tipo ?? ev?.evento ?? "evento"),
        data_evento: ev?.data ?? ev?.data_evento ?? null,
        descricao: ev?.descricao ?? ev?.texto ?? null,
        dados: typeof ev === "object" ? ev : {}, origem,
      });
    }
    if (ws.data_distribuicao) {
      await addEvent(processoId, {
        tipo: "distribuicao", data_evento: ws.data_distribuicao,
        descricao: "Distribuição do processo", origem,
      });
    }

    // Indicadores comerciais
    const sc = ws.score_comercial ?? {};
    if (processoId && (sc.score_geral != null || ws.interesse_bex || ws.prioridade)) {
      await setCommercial(processoId, {
        prioridade: ws.prioridade ?? sc.prioridade ?? null,
        complexidade: ws.complexidade ?? sc.complexidade ?? null,
        potencial_economico: Number(ws.valor_exportacao ?? sc.potencial_economico ?? 0) || null,
        probabilidade_aj: sc.probabilidade_aj ?? null,
        interesse_bex: typeof ws.interesse_bex === "number" ? ws.interesse_bex : (sc.score_geral ?? null),
        situacao_comercial: ws.situacao_comercial ?? ws.recomendacao_ia ?? null,
        score_comercial: sc, recomendacao_ia: ws.recomendacao_ia ?? null,
      });
    }

    return { empresaId, processoId, ajId, juizId, grupoId, comarcaId, varaId };
  } catch (e) {
    console.error("[knowledge] ingestWorkspace falhou:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
