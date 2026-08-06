// document-acquisition — API Corporativa
// MD-ENTERPRISE-DOCUMENT-ACQUISITION-AND-REGISTRY-ENGINE-001 (item 18)
// Ações: authenticate | download | validate | certify | register | acquire |
//        getDocument | getMetadata | search | renewSession | invalidateSession
//
// Serviço interno: consumido por outras edge functions e motores IA.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  acquireDocument, getDocument, getMetadata, renewSession, invalidateSession,
  selectConnector, validate, certify, sha256Hex, admin, logAccess,
  type AuthDescriptor,
} from "../_shared/document-acquisition.ts";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body.action || "acquire");
    const url = body.url as string | undefined;
    const auth = (body.auth ?? null) as AuthDescriptor | null;

    switch (action) {
      case "authenticate": {
        if (!url) return json({ error: "url obrigatória" }, 400);
        const c = selectConnector(url);
        const headers = await c.authenticate(auth);
        return json({ ok: true, conector: c.id, headers_aplicados: Object.keys(headers) });
      }

      case "renewSession": {
        if (!auth) return json({ error: "auth obrigatório" }, 400);
        const conector = String(body.conector || (url ? selectConnector(url).id : "https"));
        return json({ ok: true, ...(await renewSession(conector, auth)) });
      }

      case "invalidateSession": {
        const conector = String(body.conector || "https");
        const key = String(body.session_key || "");
        if (!key) return json({ error: "session_key obrigatório" }, 400);
        return json({ ok: true, ...(await invalidateSession(conector, key)) });
      }

      case "download":
      case "validate":
      case "certify": {
        if (!url) return json({ error: "url obrigatória" }, 400);
        const c = selectConnector(url);
        const headers = await c.authenticate(auth);
        const payload = await c.fetch(url, headers);
        if (action === "download") {
          return json({
            ok: true, conector: c.id, status: payload.status,
            mime: payload.mime, nome: payload.filename, tamanho_bytes: payload.bytes.length,
          });
        }
        const v = validate(payload);
        if (action === "validate") return json({ ok: true, conector: c.id, validacao: v });
        const hash = await sha256Hex(payload.bytes);
        return json({ ok: true, hash_sha256: hash, ...certify(v, payload.bytes.length, hash) });
      }

      case "register":
      case "acquire": {
        if (!url) return json({ error: "url obrigatória" }, 400);
        const r = await acquireDocument({
          url,
          projeto: (body.projeto as string) || "prospeccao_bex",
          empresa: (body.empresa as string) ?? null,
          processo: (body.processo as string) ?? null,
          user_id: (body.user_id as string) ?? null,
          dryRun: Boolean(body.dryRun),
          forceNewVersion: Boolean(body.forceNewVersion),
          auth,
        });
        const { bytes: _b, ...meta } = r;
        return json({ ok: true, ...meta });
      }

      case "getDocument": {
        const docId = String(body.document_id || "");
        if (!docId) return json({ error: "document_id obrigatório" }, 400);
        const { registry, bytes } = await getDocument(docId, {
          motor_ia: (body.motor_ia as string) || "desconhecido",
          projeto: (body.projeto as string) || "prospeccao_bex",
        });
        return json({
          ok: true,
          registry,
          content_base64: body.include_content === false ? undefined : base64(bytes),
        });
      }

      case "getMetadata": {
        const docId = String(body.document_id || "");
        if (!docId) return json({ error: "document_id obrigatório" }, 400);
        return json({ ok: true, metadata: await getMetadata(docId) });
      }

      case "search": {
        let q = admin().from("prospeccao_document_registry").select("*")
          .order("created_at", { ascending: false })
          .limit(Math.min(Number(body.limit ?? 50), 200));
        for (const f of ["document_id", "empresa", "processo", "projeto", "origem", "hash_sha256", "versao"]) {
          if (body[f] != null && body[f] !== "") q = q.eq(f, body[f] as never);
        }
        const { data, error } = await q;
        if (error) throw error;
        return json({ ok: true, total: data?.length ?? 0, documentos: data ?? [] });
      }

      default:
        return json({ error: `ação desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    console.error("[document-acquisition]", msg);
    await logAccess({ acao: "error", resultado: msg }).catch(() => {});
    return json({ ok: false, error: msg }, 500);
  }
});

function base64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
