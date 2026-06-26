// Microsoft Graph API helper — Application (client_credentials) mode.
// Authenticates directly with Azure AD using AZURE_TENANT_ID / AZURE_CLIENT_ID /
// AZURE_CLIENT_SECRET, then calls Graph as the app itself (not a delegated user).
//
// Token cache: in-memory per cold start. Tokens last ~3600s; we refresh at 3500s.

let cachedToken: { token: string; expiresAt: number } | null = null;

export interface AppCreds {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  userUpn: string; // the OneDrive user whose drive we operate on
}

export function getAppCreds(): AppCreds {
  const tenantId = Deno.env.get("AZURE_TENANT_ID");
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  const userUpn = Deno.env.get("ONEDRIVE_USER_UPN");
  if (!tenantId) throw new Error("AZURE_TENANT_ID not configured");
  if (!clientId) throw new Error("AZURE_CLIENT_ID not configured");
  if (!clientSecret) throw new Error("AZURE_CLIENT_SECRET not configured");
  if (!userUpn) throw new Error("ONEDRIVE_USER_UPN not configured");
  return { tenantId, clientId, clientSecret, userUpn };
}

export async function getAppToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const { tenantId, clientId, clientSecret } = getAppCreds();
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `Azure AD token error [${resp.status}]: ${data.error_description || JSON.stringify(data)}`,
    );
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 100) * 1000,
  };
  return cachedToken.token;
}

// Graph proxy (Application mode — direct call to graph.microsoft.com)
export async function graphApp<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAppToken();
  const url = path.startsWith("http")
    ? path
    : `https://graph.microsoft.com/v1.0/${path.replace(/^\/+/, "")}`;
  const resp = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!resp.ok || data?.error) {
    throw new Error(
      `Graph error [${resp.status}] ${path}: ${JSON.stringify(data?.error || data).slice(0, 500)}`,
    );
  }
  return data as T;
}

// Resolve the configured user's drive root (Application mode)
export async function getUserDriveRoot() {
  const { userUpn } = getAppCreds();
  const item = await graphApp<any>(`users/${encodeURIComponent(userUpn)}/drive/root`);
  return {
    driveId: item.parentReference?.driveId || item.id?.split("!")[0],
    rootItemId: item.id,
    name: item.name,
    webUrl: item.webUrl,
  };
}

// Resolve a folder by path under the configured user's drive
// Example path: "Projeto RMA" or "Projeto RMA/CLIENTE/2026/03.2026"
export async function getFolderByPath(path: string) {
  const { userUpn } = getAppCreds();
  const enc = path.split("/").map(encodeURIComponent).join("/");
  const item = await graphApp<any>(`users/${encodeURIComponent(userUpn)}/drive/root:/${enc}`);
  return {
    driveId: item.parentReference?.driveId,
    itemId: item.id,
    name: item.name,
    webUrl: item.webUrl,
  };
}

// Resolve a OneDrive/SharePoint share URL to its driveId + itemId.
// Works in Application mode as long as Files.ReadWrite.All / Sites.ReadWrite.All
// is granted with admin consent. The link does NOT need to be shared with the app.
export async function resolveShareUrl(shareUrl: string) {
  // Encode per Microsoft spec: base64url, strip '=', replace '/' '+' with '_' '-', prefix 'u!'
  const b64 = btoa(shareUrl)
    .replace(/=+$/, "")
    .replace(/\//g, "_")
    .replace(/\+/g, "-");
  // Application tokens MUST send Prefer: redeemSharingLink to resolve personal/SP share links
  const item = await graphApp<any>(`shares/u!${b64}/driveItem`, {
    headers: { Prefer: 'redeemSharingLink' },
  });
  return {
    driveId: item.parentReference?.driveId as string,
    itemId: item.id as string,
    name: item.name as string,
    webUrl: item.webUrl as string,
    isFolder: !!item.folder,
  };
}

// Navigate down a relative path (e.g. "CLIENTE/2026/03.2026") from a given folder
export async function getChildByRelativePath(driveId: string, parentItemId: string, relPath: string) {
  const enc = relPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const item = await graphApp<any>(`drives/${driveId}/items/${parentItemId}:/${enc}`);
  return {
    driveId: item.parentReference?.driveId || driveId,
    itemId: item.id as string,
    name: item.name as string,
    webUrl: item.webUrl as string,
  };
}
