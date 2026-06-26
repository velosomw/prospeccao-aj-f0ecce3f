// rma-doc-init
// Cria um rma_documents a partir de um template e popula as seções iniciais.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`supabase ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

type Node = { numero?: string; titulo: string; prompt?: string; children?: Node[] };

function flatten(nodes: Node[], parentNumero = ""): Array<Node & { _level: number; _parent_numero: string | null }> {
  const out: any[] = [];
  for (const n of nodes) {
    out.push({ ...n, _level: parentNumero ? 2 : 1, _parent_numero: parentNumero || null });
    if (n.children?.length) out.push(...flatten(n.children, n.numero || ""));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { rma_id, tipo, titulo, created_by, copy_from_tipo } = await req.json();
    if (!rma_id || !tipo) throw new Error("rma_id e tipo obrigatórios");

    // Carrega seções de origem (migração) por numero -> conteudo_editado
    const copyMap = new Map<string, { conteudo_editado: string | null; status: string | null }>();
    if (copy_from_tipo && copy_from_tipo !== tipo) {
      const srcDoc = (await sb(
        `rma_documents?rma_id=eq.${rma_id}&tipo=eq.${copy_from_tipo}&select=id&order=created_at.desc&limit=1`,
      ))[0];
      if (srcDoc?.id) {
        const srcSecs = await sb(
          `rma_document_sections?document_id=eq.${srcDoc.id}&select=numero,conteudo_editado,status&not.numero=is.null`,
        );
        for (const s of srcSecs) {
          if (s.numero && s.conteudo_editado) {
            copyMap.set(s.numero, { conteudo_editado: s.conteudo_editado, status: s.status });
          }
        }
      }
    }

    const tpl = (await sb(`rma_document_templates?tipo=eq.${tipo}&select=*&limit=1`))[0];
    if (!tpl) throw new Error(`template ${tipo} não encontrado`);

    // Reusa documento existente em rascunho/produção do mesmo RMA+tipo se houver
    const existing = await sb(
      `rma_documents?rma_id=eq.${rma_id}&tipo=eq.${tipo}&status=in.(rascunho,em_producao,pre_parecer)&select=id&limit=1`,
    );
    if (existing?.[0]) {
      return new Response(JSON.stringify({ ok: true, document_id: existing[0].id, reused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docs = await sb("rma_documents", {
      method: "POST",
      body: JSON.stringify([
        {
          rma_id,
          template_id: tpl.id,
          tipo,
          titulo: titulo || tpl.nome,
          status: "em_producao",
          created_by,
        },
      ]),
    });
    const doc = docs[0];

    const flat = flatten(tpl.structure as Node[]);
    // mapa numero -> id (preencher após insert)
    const rows = flat.map((n, i) => {
      const cp = n.numero ? copyMap.get(n.numero) : undefined;
      return {
        document_id: doc.id,
        ordem: i + 1,
        numero: n.numero || null,
        titulo: n.titulo,
        prompt_contexto: n.prompt || null,
        conteudo_editado: cp?.conteudo_editado ?? null,
        status: cp?.conteudo_editado ? (cp.status || "rascunho") : "pendente",
      };
    });
    const insertedSections = await sb("rma_document_sections", {
      method: "POST",
      body: JSON.stringify(rows),
    });

    // Liga parent_id por numero
    const byNumero = new Map<string, string>();
    insertedSections.forEach((s: any) => s.numero && byNumero.set(s.numero, s.id));
    const updates = flat
      .map((n, i) => ({ flatNode: n, section: insertedSections[i] }))
      .filter((x) => x.flatNode._parent_numero && byNumero.has(x.flatNode._parent_numero));
    for (const u of updates) {
      await sb(`rma_document_sections?id=eq.${u.section.id}`, {
        method: "PATCH",
        body: JSON.stringify({ parent_id: byNumero.get(u.flatNode._parent_numero) }),
      });
    }

    return new Response(
      JSON.stringify({ ok: true, document_id: doc.id, sections: insertedSections.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("rma-doc-init", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
