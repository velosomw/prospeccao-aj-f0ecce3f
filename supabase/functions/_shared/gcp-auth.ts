// gcp-auth.ts — Helper para autenticação OAuth2 com Service Account JSON
// Gera Bearer Token assinando JWT (RS256) com a private key do JSON da SA.
// Cache em memória por cold start (token vive ~3600s, refresh em 3500s).

interface SAKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

let cached: { token: string; expiresAt: number; scope: string } | null = null;

function getSAKey(): SAKey {
  const raw = Deno.env.get("GCP_SA_KEY_JSON");
  if (!raw) throw new Error("GCP_SA_KEY_JSON not configured");

  // Tenta múltiplas estratégias de parse para tolerar:
  //  - JSON puro
  //  - JSON cercado de aspas / espaços / quebras
  //  - JSON com escapes duplos (\\n no private_key)
  //  - Lixo antes/depois do bloco { ... }
  const tryParse = (s: string): SAKey | null => {
    try {
      const k = JSON.parse(s);
      if (k && k.client_email && k.private_key) {
        return {
          client_email: k.client_email,
          private_key: String(k.private_key).replace(/\\n/g, "\n"),
          token_uri: k.token_uri || "https://oauth2.googleapis.com/token",
        };
      }
    } catch (_) { /* continua */ }
    return null;
  };

  const candidates: string[] = [];
  candidates.push(raw.trim());
  // Remove aspas externas
  candidates.push(raw.trim().replace(/^['"]|['"]$/g, ""));
  // Extrai do primeiro { até o último }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  // Decodifica se vier base64
  try {
    const decoded = atob(raw.trim());
    if (decoded.includes("private_key")) candidates.push(decoded);
  } catch (_) { /* não é base64 */ }

  for (const c of candidates) {
    const sa = tryParse(c);
    if (sa) return sa;
  }

  throw new Error(
    `GCP_SA_KEY_JSON inválido (len=${raw.length}, head="${raw.slice(0, 20).replace(/\n/g, "\\n")}"). ` +
      `Esperado JSON da Service Account com client_email + private_key.`,
  );
}

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function signJwt(sa: SAKey, scope: string): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const claimsB64 = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(sig)}`;
}

/** Bearer token para chamar APIs GCP. Default scope cobre Storage + Document AI. */
export async function getGcpAccessToken(
  scope = "https://www.googleapis.com/auth/cloud-platform",
): Promise<string> {
  if (cached && cached.scope === scope && Date.now() < cached.expiresAt) {
    return cached.token;
  }
  const sa = getSAKey();
  const jwt = await signJwt(sa, scope);
  const resp = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`GCP token error [${resp.status}]: ${data.error_description || JSON.stringify(data)}`);
  }
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 100) * 1000,
    scope,
  };
  return cached.token;
}

/** Upload bytes para gs://{bucket}/{objectPath} */
export async function gcsUpload(bucket: string, objectPath: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const token = await getGcpAccessToken();
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: bytes,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`GCS upload failed [${resp.status}]: ${t.slice(0, 500)}`);
  }
  return `gs://${bucket}/${objectPath}`;
}

/** Lista objetos com prefixo (para varrer output do Document AI). */
export async function gcsList(bucket: string, prefix: string): Promise<{ name: string; size: string }[]> {
  const token = await getGcpAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?prefix=${encodeURIComponent(prefix)}&maxResults=1000`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`GCS list failed [${resp.status}]: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  return (data.items ?? []).map((o: { name: string; size: string }) => ({ name: o.name, size: o.size }));
}

/** Download de objeto GCS como JSON. */
export async function gcsDownloadJson<T = unknown>(bucket: string, objectPath: string): Promise<T> {
  const token = await getGcpAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`GCS download failed [${resp.status}]: ${(await resp.text()).slice(0, 300)}`);
  return await resp.json() as T;
}

/** Apaga objeto (limpeza opcional após processar). */
export async function gcsDelete(bucket: string, objectPath: string): Promise<void> {
  const token = await getGcpAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`;
  await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
}
