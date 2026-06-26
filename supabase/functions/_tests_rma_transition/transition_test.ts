// Integration test for transition_rma_section_status:
// - Blocks revisado -> em_edicao with empty rejection_comment (motivo)
// - Allows revisado -> em_edicao with motivo length >= 3
//
// Runs against the live Supabase project using SUPABASE_SERVICE_ROLE_KEY.
// Uses a transactional approach: creates ephemeral fixtures and cleans up at the end.
//
// Run via supabase--test_edge_functions.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Helper: create a fake user + grant a role + create doc + section already in 'revisado'
async function setupFixture() {
  const sb = admin();
  const email = `test-coord-${crypto.randomUUID()}@bex.test`;

  // Create user
  const { data: u, error: uerr } = await sb.auth.admin.createUser({
    email,
    password: "Test12345!",
    email_confirm: true,
  });
  if (uerr) throw uerr;
  const userId = u.user!.id;

  // Grant coordenador role (allowed to send back revisado -> em_edicao)
  const { error: rerr } = await sb.from("user_roles").insert({
    user_id: userId,
    role: "coordenador",
  });
  if (rerr) throw rerr;

  // Create RMA document (minimal)
  const rmaId = `TST-${Date.now()}`;
  const { data: doc, error: derr } = await sb
    .from("rma_documents")
    .insert({ rma_id: rmaId, tipo: "parecer", titulo: "Doc de teste", progresso: 0 })
    .select()
    .single();
  if (derr) throw derr;

  // Create a section already in 'revisado' with content (so transition is otherwise valid)
  const { data: sec, error: serr } = await sb
    .from("rma_document_sections")
    .insert({
      document_id: doc.id,
      ordem: 1,
      titulo: "Seção de teste",
      conteudo_ia: "conteúdo gerado pela IA",
      conteudo_editado: "conteúdo revisado",
      status: "revisado",
      versao_atual: 1,
    })
    .select()
    .single();
  if (serr) throw serr;

  return { userId, docId: doc.id, sectionId: sec.id, email };
}

async function cleanup(userId: string, docId: string) {
  const sb = admin();
  await sb.from("rma_section_audit_log").delete().eq("document_id", docId);
  await sb.from("rma_document_section_versions").delete().in(
    "section_id",
    (await sb.from("rma_document_sections").select("id").eq("document_id", docId)).data?.map((r: any) => r.id) ?? [],
  );
  await sb.from("rma_document_sections").delete().eq("document_id", docId);
  await sb.from("rma_documents").delete().eq("id", docId);
  await sb.from("user_roles").delete().eq("user_id", userId);
  await sb.auth.admin.deleteUser(userId);
}

// Calls the RPC impersonating a given user. We use the service-role client but
// override the Authorization header with a freshly minted user access token
// so that auth.uid() returns the test user inside the RPC.
async function callRpcAsUser(userId: string, sectionId: string, motivo: string | null) {
  const sb = admin();
  const email = (await sb.auth.admin.getUserById(userId)).data.user!.email!;

  // Mint a session for this user via admin API (no anon key needed)
  const { data: sess, error: sessErr } = await (sb.auth.admin as any).createSession?.({
    user_id: userId,
  }) ?? { data: null, error: new Error("createSession unavailable") };

  let accessToken: string | null = sess?.access_token ?? null;

  // Fallback: sign in with password using the service-role URL but anon-style call
  if (!accessToken) {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ email, password: "Test12345!" }),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(`token endpoint: ${JSON.stringify(json)}`);
    accessToken = json.access_token;
  }

  // Call the RPC via REST with the user's JWT
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/transition_rma_section_status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      p_section_id: sectionId,
      p_new_status: "em_edicao",
      p_motivo: motivo,
    }),
  });
  const body = await resp.json();
  if (!resp.ok) {
    return { data: null, error: { message: body?.message ?? JSON.stringify(body), code: body?.code } };
  }
  return { data: body, error: null };
}

Deno.test("revisado -> em_edicao bloqueia quando motivo está vazio", async () => {
  const fx = await setupFixture();
  try {
    const { data, error } = await callRpcAsUser(fx.userId, fx.sectionId, null);
    assert(error, "RPC deveria retornar erro quando motivo é nulo");
    assertStringIncludes(
      (error?.message || "").toLowerCase(),
      "motivo",
      `Mensagem de erro deveria mencionar 'motivo'. Recebido: ${error?.message}`,
    );
    assert(!data, "Não deveria retornar dados em caso de bloqueio");

    // Também testa string vazia / curta — todos devem bloquear
    const { error: err2 } = await callRpcAsUser(fx.userId, fx.sectionId, "  ");
    assert(err2, "Motivo só com espaços deve bloquear");
    assertStringIncludes((err2!.message || "").toLowerCase(), "motivo");

    const { error: err3 } = await callRpcAsUser(fx.userId, fx.sectionId, "ab");
    assert(err3, "Motivo com menos de 3 chars deve bloquear");
    assertStringIncludes((err3!.message || "").toLowerCase(), "motivo");

    // Seção permanece intacta em 'revisado' (transação revertida pelo RAISE)
    const sb = admin();
    const { data: secNow } = await sb
      .from("rma_document_sections")
      .select("status,motivo_devolucao")
      .eq("id", fx.sectionId)
      .single();
    assertEquals(secNow?.status, "revisado", "Status não pode ter mudado");
    assertEquals(secNow?.motivo_devolucao, null, "motivo_devolucao não pode ter sido preenchido");

    // Nenhum registro 'allowed' deve existir para esta seção (RPC não passou)
    const { data: allowedLogs } = await sb
      .from("rma_section_audit_log")
      .select("action")
      .eq("section_id", fx.sectionId)
      .eq("action", "allowed");
    assertEquals(allowedLogs?.length ?? 0, 0, "Não deve haver log 'allowed' para tentativa bloqueada");
  } finally {
    await cleanup(fx.userId, fx.docId);
  }
});

Deno.test("revisado -> em_edicao permite quando motivo tem >= 3 caracteres", async () => {
  const fx = await setupFixture();
  try {
    const motivo = "Ajustar parágrafo sobre passivo circulante";
    const { data, error } = await callRpcAsUser(fx.userId, fx.sectionId, motivo);
    assertEquals(error, null, `RPC deveria executar sem erro. Erro: ${error?.message}`);
    assert(data, "Deveria retornar a seção atualizada");

    const sb = admin();
    const { data: secNow } = await sb
      .from("rma_document_sections")
      .select("status,motivo_devolucao,aprovado_por,aprovado_em")
      .eq("id", fx.sectionId)
      .single();
    assertEquals(secNow?.status, "em_edicao", "Status deve ter voltado para em_edicao");
    assertEquals(secNow?.motivo_devolucao, motivo, "motivo_devolucao deve persistir o comentário");
    assertEquals(secNow?.aprovado_por, null, "aprovado_por deve ser limpo na devolução");
    assertEquals(secNow?.aprovado_em, null, "aprovado_em deve ser limpo na devolução");

    // Audit log allowed com motivo
    const { data: logs } = await sb
      .from("rma_section_audit_log")
      .select("action,reason,from_status,to_status,motivo")
      .eq("section_id", fx.sectionId)
      .order("created_at", { ascending: false })
      .limit(1);
    assert(logs && logs.length > 0, "Audit log deveria registrar a transição");
    assertEquals(logs[0].action, "allowed");
    assertEquals(logs[0].reason, "transition_ok");
    assertEquals(logs[0].from_status, "revisado");
    assertEquals(logs[0].to_status, "em_edicao");
    assertEquals(logs[0].motivo, motivo);
  } finally {
    await cleanup(fx.userId, fx.docId);
  }
});
