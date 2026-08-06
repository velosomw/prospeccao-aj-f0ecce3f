// MD-ENTERPRISE-DOCUMENT-ACQUISITION-AND-REGISTRY-ENGINE-001
// Camada corporativa de aquisição, certificação, registro e disponibilização
// de documentos para TODOS os motores de IA da Orange AI Platform.
//
// Regra de ouro: nenhum motor de IA recebe URL. Motores recebem apenas Document_ID.
//
// Pipeline oficial:
// URL -> Connector -> authenticate -> session -> download -> validate ->
// hash SHA-256 -> certify -> register -> storage -> Document_ID -> Motores IA

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const CORPORATE_BUCKET = "documentos-corporativos";

export const ALLOWED_MIME = [
  "application/pdf",
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "application/zip",
  "image/png",
  "image/jpeg",
  "image/tiff",
];

export interface AcquireInput {
  url: string;
  projeto?: string;
  empresa?: string | null;
  processo?: string | null;
  user_id?: string | null;
  origem_hint?: string | null;
  /** modo homologação: nenhum write no banco/storage */
  dryRun?: boolean;
  /** força nova versão mesmo que o hash exista */
  forceNewVersion?: boolean;
  auth?: AuthDescriptor | null;
}

export interface AuthDescriptor {
  /** cookie | bearer | jwt | oauth | apikey | session */
  type: "cookie" | "bearer" | "jwt" | "oauth" | "apikey" | "session" | "none";
  /** valor efêmero — NUNCA persistido em texto claro */
  value?: string;
  header?: string;
  ttl_seconds?: number;
  session_key?: string;
}

export interface DocumentRecord {
  document_id: string;
  registry_id: string | null;
  hash_sha256: string;
  storage_path: string | null;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  paginas: number | null;
  versao: number;
  origem: string;
  conector: string;
  certificado: boolean;
  certificacao: Record<string, unknown>;
  reused: boolean;
}

export interface AcquireResult extends DocumentRecord {
  bytes: Uint8Array;
  tempos: { download_ms: number; validacao_ms: number; hash_ms: number; registro_ms: number };
}

export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

/* ------------------------------------------------------------------ */
/* Connectors                                                          */
/* ------------------------------------------------------------------ */

export interface FetchedPayload {
  bytes: Uint8Array;
  mime: string;
  filename: string;
  status: number;
  origem: string;
}

export interface Connector {
  id: string;
  supports(url: string): boolean;
  authenticate(auth?: AuthDescriptor | null): Promise<Record<string, string>>;
  fetch(url: string, headers: Record<string, string>): Promise<FetchedPayload>;
}

function filenameFromUrl(url: string, fallback = "documento.pdf"): string {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean).pop();
    return p && p.includes(".") ? decodeURIComponent(p) : fallback;
  } catch {
    return fallback;
  }
}

/** Connector HTTPS genérico (Gestor Jurídico, API REST, links públicos autenticados). */
const ConnectorHttps: Connector = {
  id: "https",
  supports: (u) => u.startsWith("https://"),
  async authenticate(auth) {
    const headers: Record<string, string> = {
      "User-Agent": "Orange-Document-Acquisition-Engine/1.0",
      Accept: "application/pdf,application/octet-stream,*/*",
    };
    if (!auth || auth.type === "none" || !auth.value) return headers;
    switch (auth.type) {
      case "cookie":
        headers["Cookie"] = auth.value;
        break;
      case "apikey":
        headers[auth.header || "x-api-key"] = auth.value;
        break;
      default:
        headers["Authorization"] = auth.value.startsWith("Bearer ")
          ? auth.value
          : `Bearer ${auth.value}`;
    }
    return headers;
  },
  async fetch(url, headers) {
    const resp = await fetch(url, { redirect: "follow", headers });
    if (!resp.ok) throw new Error(`DOWNLOAD_${resp.status}: HTTP ${resp.status}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const mime = (resp.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const disp = resp.headers.get("content-disposition") || "";
    const m = disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return {
      bytes,
      mime,
      filename: m ? decodeURIComponent(m[1]) : filenameFromUrl(url),
      status: resp.status,
      origem: new URL(url).hostname,
    };
  },
};

/** Connector Supabase Storage (documentos já internos à plataforma). */
const ConnectorSupabaseStorage: Connector = {
  id: "supabase_storage",
  supports: (u) => u.startsWith("storage://"),
  async authenticate() {
    return {};
  },
  async fetch(url) {
    const raw = url.replace("storage://", "");
    const [bucket, ...rest] = raw.includes("/") ? raw.split("/") : ["prospeccao-uploads", raw];
    const knownBucket = rest.length > 0 ? bucket : "prospeccao-uploads";
    const path = rest.length > 0 ? rest.join("/") : raw;
    const { data, error } = await admin().storage.from(knownBucket).download(path);
    if (error) throw new Error(`STORAGE_ERRO: ${error.message}`);
    const buf = new Uint8Array(await data.arrayBuffer());
    return {
      bytes: buf,
      mime: data.type || "application/pdf",
      filename: path.split("/").pop() || "documento.pdf",
      status: 200,
      origem: `supabase:${knownBucket}`,
    };
  },
};

/** Connector Microsoft Graph (OneDrive / SharePoint) via credenciais de app. */
const ConnectorMicrosoftGraph: Connector = {
  id: "microsoft_graph",
  supports: (u) => u.startsWith("graph://"),
  async authenticate() {
    return {};
  },
  async fetch(url) {
    // graph://<driveId>/<itemId>  ou  graph://items/<itemId>
    const raw = url.replace("graph://", "");
    const parts = raw.split("/").filter(Boolean);
    const { graphApp, getAppCreds } = await import("./graph-app.ts");
    const select = "id,name,file,@microsoft.graph.downloadUrl";
    const paths: string[] = [];
    if (parts.length >= 2 && parts[0] !== "items") {
      paths.push(`drives/${parts[0]}/items/${parts[1]}?select=${select}`);
    }
    const itemId = parts[parts.length - 1];
    const { userUpn } = getAppCreds();
    paths.push(`users/${encodeURIComponent(userUpn)}/drive/items/${itemId}?select=${select}`);

    let lastErr: unknown = null;
    for (const p of paths) {
      try {
        const meta = await graphApp<{ name?: string; "@microsoft.graph.downloadUrl"?: string }>(p);
        const dl = meta["@microsoft.graph.downloadUrl"];
        if (!dl) throw new Error("sem downloadUrl");
        const r = await fetch(dl);
        if (!r.ok) throw new Error(`DOWNLOAD_${r.status}`);
        return {
          bytes: new Uint8Array(await r.arrayBuffer()),
          mime: (r.headers.get("content-type") || "application/pdf").split(";")[0],
          filename: meta.name || `${itemId}.pdf`,
          status: 200,
          origem: "microsoft_graph",
        };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  },
};

export const CONNECTORS: Connector[] = [
  ConnectorSupabaseStorage,
  ConnectorMicrosoftGraph,
  ConnectorHttps,
];

export function selectConnector(url: string): Connector {
  const c = CONNECTORS.find((x) => x.supports(url));
  if (!c) throw new Error("CONECTOR_INDISPONIVEL: origem não suportada");
  return c;
}

/* ------------------------------------------------------------------ */
/* Sessões (efêmeras, nunca credenciais permanentes)                    */
/* ------------------------------------------------------------------ */

export async function renewSession(conector: string, auth: AuthDescriptor) {
  const ttl = Math.min(Math.max(auth.ttl_seconds ?? 900, 60), 3600);
  const expires = new Date(Date.now() + ttl * 1000).toISOString();
  const key = auth.session_key || crypto.randomUUID();
  await admin().from("document_connector_sessions").upsert(
    {
      conector,
      session_key: key,
      auth_type: auth.type,
      expires_at: expires,
      metadata: { renewed_at: new Date().toISOString() },
    },
    { onConflict: "conector,session_key" },
  );
  return { session_key: key, expires_at: expires };
}

export async function invalidateSession(conector: string, session_key: string) {
  await admin().from("document_connector_sessions").delete()
    .eq("conector", conector).eq("session_key", session_key);
  return { invalidated: true };
}

async function purgeExpiredSessions() {
  await admin().from("document_connector_sessions")
    .delete().lt("expires_at", new Date().toISOString());
}

/* ------------------------------------------------------------------ */
/* Validação / Certificação                                            */
/* ------------------------------------------------------------------ */

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function validate(payload: FetchedPayload) {
  if (payload.bytes.length === 0) throw new Error("DOCUMENTO_VAZIO: 0 bytes");
  const mime = payload.mime || "application/octet-stream";
  if (!ALLOWED_MIME.some((m) => mime.startsWith(m.split("/")[0]) && (mime === m || m === "application/octet-stream"))) {
    // aceita octet-stream e famílias conhecidas; caso contrário apenas registra
    console.warn(`[acquisition] Content-Type inesperado: ${mime}`);
  }
  const head = new TextDecoder().decode(payload.bytes.subarray(0, 5));
  const isPdf = head.startsWith("%PDF");
  const corrompido = mime.includes("pdf") && !isPdf;
  const paginas = isPdf ? countPdfPages(payload.bytes) : null;
  return {
    isPdf,
    corrompido,
    paginas,
    mime,
    ocr_necessario: isPdf ? !hasExtractableText(payload.bytes) : false,
  };
}

function countPdfPages(bytes: Uint8Array): number | null {
  try {
    const txt = new TextDecoder("latin1").decode(bytes);
    const matches = txt.match(/\/Type\s*\/Page[^s]/g);
    if (matches?.length) return matches.length;
    const counts = [...txt.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
    return counts.length ? Math.max(...counts) : null;
  } catch {
    return null;
  }
}

function hasExtractableText(bytes: Uint8Array): boolean {
  try {
    const txt = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 2_000_000)));
    return /\/Font|BT\s|\bTj\b/.test(txt);
  } catch {
    return false;
  }
}

export function certify(v: ReturnType<typeof validate>, size: number, hash: string) {
  const checks = {
    integridade: size > 0,
    hash_gerado: hash.length === 64,
    formato_valido: !v.corrompido,
    paginas_identificadas: v.paginas != null ? v.paginas > 0 : true,
    nao_corrompido: !v.corrompido,
  };
  return { checks, certificado: Object.values(checks).every(Boolean) };
}

/* ------------------------------------------------------------------ */
/* Storage corporativo                                                 */
/* ------------------------------------------------------------------ */

export function buildStoragePath(
  documentId: string,
  filename: string,
  opts: { origem: string; empresa?: string | null; processo?: string | null },
) {
  const now = new Date();
  const ano = String(now.getUTCFullYear());
  const mes = String(now.getUTCMonth() + 1).padStart(2, "0");
  const slug = (s: string | null | undefined, fb: string) =>
    (s || fb).toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fb;
  return [
    "documentos", ano, mes,
    slug(opts.origem, "origem"),
    slug(opts.empresa, "sem-empresa"),
    slug(opts.processo, "sem-processo"),
    documentId,
    slug(filename, "documento.pdf"),
  ].join("/");
}

/* ------------------------------------------------------------------ */
/* API corporativa                                                     */
/* ------------------------------------------------------------------ */

/** Pipeline completo: adquire, certifica, registra e devolve Document_ID + bytes. */
export async function acquireDocument(input: AcquireInput): Promise<AcquireResult> {
  const db = admin();
  const connector = selectConnector(input.url);
  const headers = await connector.authenticate(input.auth);

  const t0 = Date.now();
  let payload: FetchedPayload;
  try {
    payload = await connector.fetch(input.url, headers);
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    if (!input.dryRun) {
      await db.from("prospeccao_document_fetch_logs").insert({
        url: input.url,
        error_code: msg.split(":")[0],
        status_code: Number(msg.match(/\d{3}/)?.[0] ?? 500),
      });
    }
    throw e;
  }
  const download_ms = Date.now() - t0;

  const tv = Date.now();
  const v = validate(payload);
  const validacao_ms = Date.now() - tv;

  const th = Date.now();
  const hash = await sha256Hex(payload.bytes);
  const hash_ms = Date.now() - th;

  const cert = certify(v, payload.bytes.length, hash);
  const tr = Date.now();

  // Homologação: nenhum efeito colateral
  if (input.dryRun) {
    return {
      document_id: `DRY-${hash.slice(0, 12).toUpperCase()}`,
      registry_id: null,
      hash_sha256: hash,
      storage_path: null,
      nome_arquivo: payload.filename,
      mime_type: v.mime,
      tamanho_bytes: payload.bytes.length,
      paginas: v.paginas,
      versao: 1,
      origem: payload.origem,
      conector: connector.id,
      certificado: cert.certificado,
      certificacao: cert.checks,
      reused: false,
      bytes: payload.bytes,
      tempos: { download_ms, validacao_ms, hash_ms, registro_ms: 0 },
    };
  }

  // Duplicidade: mesmo hash => reutiliza Document_ID (sem novo download/registro)
  const { data: existing } = await db
    .from("prospeccao_document_registry")
    .select("id, document_id, storage_path, versao, nome_arquivo, mime_type, tamanho_bytes, paginas, origem, conector, certificado, certificacao")
    .eq("hash_sha256", hash)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && !input.forceNewVersion) {
    await db.from("prospeccao_document_registry")
      .update({ ultimo_acesso_em: new Date().toISOString(), acessos: (existing as any).acessos ?? undefined })
      .eq("id", existing.id);
    await logAccess({
      document_id: existing.document_id, registry_id: existing.id, projeto: input.projeto,
      acao: "reuse", hash_sha256: hash, versao: existing.versao, resultado: "reutilizado",
      tempo_ms: Date.now() - t0, user_id: input.user_id ?? null,
    });
    return {
      document_id: existing.document_id,
      registry_id: existing.id,
      hash_sha256: hash,
      storage_path: existing.storage_path,
      nome_arquivo: existing.nome_arquivo || payload.filename,
      mime_type: existing.mime_type || v.mime,
      tamanho_bytes: Number(existing.tamanho_bytes || payload.bytes.length),
      paginas: existing.paginas ?? v.paginas,
      versao: existing.versao ?? 1,
      origem: existing.origem || payload.origem,
      conector: existing.conector || connector.id,
      certificado: Boolean(existing.certificado),
      certificacao: (existing.certificacao as Record<string, unknown>) || cert.checks,
      reused: true,
      bytes: payload.bytes,
      tempos: { download_ms, validacao_ms, hash_ms, registro_ms: Date.now() - tr },
    };
  }

  // Versionamento: mesma URL original => nova versão encadeada
  const { data: prev } = await db
    .from("prospeccao_document_registry")
    .select("document_id, versao")
    .eq("url_original", input.url)
    .order("versao", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versao = (prev?.versao ?? 0) + 1;
  const { data: generated, error: idErr } = await db.rpc("generate_document_id");
  if (idErr) throw idErr;
  const documentId = generated as string;

  const storagePath = buildStoragePath(documentId, payload.filename, {
    origem: payload.origem, empresa: input.empresa, processo: input.processo,
  });
  const { error: upErr } = await db.storage.from(CORPORATE_BUCKET)
    .upload(storagePath, payload.bytes, { contentType: v.mime, upsert: true });
  if (upErr) throw new Error(`STORAGE_UPLOAD: ${upErr.message}`);

  const { data: reg, error: regErr } = await db.from("prospeccao_document_registry").insert({
    document_id: documentId,
    hash_sha256: hash,
    nome_arquivo: payload.filename,
    extensao: (payload.filename.split(".").pop() || "").toLowerCase(),
    mime_type: v.mime,
    tamanho_bytes: payload.bytes.length,
    storage_path: storagePath,
    url_original: input.url,
    origem: payload.origem,
    conector: connector.id,
    projeto: input.projeto || "prospeccao_bex",
    empresa: input.empresa ?? null,
    processo: input.processo ?? null,
    paginas: v.paginas,
    ocr_necessario: v.ocr_necessario,
    certificado: cert.certificado,
    certificacao: cert.checks,
    parent_document_id: prev?.document_id ?? null,
    versao,
    status: cert.certificado ? "certificado" : "pendente_revisao",
    created_by: input.user_id ?? null,
    ultimo_acesso_em: new Date().toISOString(),
  }).select("id").single();
  if (regErr) throw regErr;

  await db.from("prospeccao_document_fetch_logs").insert({
    url: input.url,
    registry_id: reg.id,
    status_code: payload.status,
    content_type: v.mime,
    file_size: payload.bytes.length,
    hash_sha256: hash,
    tempo_download_ms: download_ms,
  });

  await logAccess({
    document_id: documentId, registry_id: reg.id, projeto: input.projeto,
    acao: "acquire", hash_sha256: hash, versao, resultado: cert.certificado ? "certificado" : "pendente_revisao",
    tempo_ms: Date.now() - t0, user_id: input.user_id ?? null,
    metadata: { conector: connector.id, download_ms, validacao_ms, hash_ms, ocr_necessario: v.ocr_necessario },
  });

  await purgeExpiredSessions().catch(() => {});

  return {
    document_id: documentId,
    registry_id: reg.id,
    hash_sha256: hash,
    storage_path: storagePath,
    nome_arquivo: payload.filename,
    mime_type: v.mime,
    tamanho_bytes: payload.bytes.length,
    paginas: v.paginas,
    versao,
    origem: payload.origem,
    conector: connector.id,
    certificado: cert.certificado,
    certificacao: cert.checks,
    reused: false,
    bytes: payload.bytes,
    tempos: { download_ms, validacao_ms, hash_ms, registro_ms: Date.now() - tr },
  };
}

/** Entrega o documento certificado para um motor de IA a partir do Document_ID. */
export async function getDocument(documentId: string, opts: { motor_ia?: string; projeto?: string } = {}) {
  const db = admin();
  const { data: reg, error } = await db.from("prospeccao_document_registry")
    .select("*").eq("document_id", documentId).maybeSingle();
  if (error) throw error;
  if (!reg) throw new Error(`DOCUMENTO_NAO_ENCONTRADO: ${documentId}`);
  if (!reg.storage_path) throw new Error(`DOCUMENTO_SEM_STORAGE: ${documentId}`);

  const { data: file, error: dlErr } = await db.storage.from(CORPORATE_BUCKET).download(reg.storage_path);
  if (dlErr) throw new Error(`STORAGE_DOWNLOAD: ${dlErr.message}`);
  const bytes = new Uint8Array(await file.arrayBuffer());

  await db.from("prospeccao_document_registry")
    .update({ ultimo_acesso_em: new Date().toISOString(), acessos: (reg.acessos || 0) + 1 })
    .eq("id", reg.id);

  await logAccess({
    document_id: documentId, registry_id: reg.id, projeto: opts.projeto,
    motor_ia: opts.motor_ia, acao: "deliver_ai", hash_sha256: reg.hash_sha256,
    versao: reg.versao, resultado: "entregue",
  });

  return { registry: reg, bytes };
}

export async function getMetadata(documentId: string) {
  const { data, error } = await admin().from("prospeccao_document_registry")
    .select("*").eq("document_id", documentId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function logAccess(entry: {
  document_id?: string | null;
  registry_id?: string | null;
  projeto?: string | null;
  motor_ia?: string | null;
  acao: string;
  hash_sha256?: string | null;
  versao?: number | null;
  resultado?: string | null;
  tempo_ms?: number | null;
  user_id?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await admin().from("document_access_log").insert({
      document_id: entry.document_id ?? null,
      registry_id: entry.registry_id ?? null,
      projeto: entry.projeto ?? "prospeccao_bex",
      motor_ia: entry.motor_ia ?? null,
      acao: entry.acao,
      hash_sha256: entry.hash_sha256 ?? null,
      versao: entry.versao ?? null,
      resultado: entry.resultado ?? null,
      tempo_ms: entry.tempo_ms ?? null,
      user_id: entry.user_id ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error("[acquisition] logAccess falhou:", e);
  }
}
