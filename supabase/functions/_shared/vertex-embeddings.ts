// Vertex AI Embeddings (text-embedding-004 / gecko@003 — 768 dims)
// Reusa GOOGLE_VISION_CREDENTIALS (Service Account com escopo cloud-platform)

import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

const VERTEX_LOCATION = Deno.env.get("VERTEX_LOCATION") || "us-central1";
const VERTEX_MODEL = Deno.env.get("VERTEX_EMBEDDING_MODEL") || "text-embedding-004";
const MAX_CHARS = 2000;

let cachedSa: ServiceAccount | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

function loadSa(): ServiceAccount | null {
  if (cachedSa) return cachedSa;
  const raw = Deno.env.get("GOOGLE_VISION_CREDENTIALS");
  if (!raw) return null;
  const trimmed = raw.trim();
  // API key (não-JSON) → Vertex embeddings indisponível, pipeline segue sem semântica
  if (!trimmed.startsWith("{")) return null;
  try {
    const sa = JSON.parse(trimmed) as ServiceAccount;
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    cachedSa = sa;
    return sa;
  } catch {
    return null;
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const sa = loadSa();
  if (!sa) return null;
  const key = await importPrivateKey(sa.private_key);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      exp: getNumericDate(3600),
      iat: getNumericDate(0),
    },
    key,
  );
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Vertex OAuth falhou [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

/** Gera embedding 768D via Vertex AI. Retorna null em caso de falha (não bloqueia o pipeline). */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  try {
    const sa = loadSa();
    if (!sa) return null;
    const token = await getAccessToken();
    if (!token) return null;
    const trimmed = text.slice(0, MAX_CHARS);
    const url =
      `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}` +
      `/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:predict`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ content: trimmed, task_type: "RETRIEVAL_DOCUMENT" }],
      }),
    });
    if (!resp.ok) {
      console.error("Vertex embedding error", resp.status, await resp.text());
      return null;
    }
    const j = await resp.json();
    const v = j?.predictions?.[0]?.embeddings?.values;
    return Array.isArray(v) ? v : null;
  } catch (e) {
    console.error("generateEmbedding falhou", e);
    return null;
  }
}

export const EMBEDDING_DIMS = 768;
