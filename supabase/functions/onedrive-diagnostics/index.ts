// Diagnostics endpoint: tests each Graph API call used by the OneDrive
// integration and reports which token type was used + per-step status code,
// message, and latency. Returns 200 even on partial failures so the UI can
// render a full report.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAppCreds, getAppToken } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Check {
  step: string;
  endpoint: string;
  tokenType: "app" | "connector" | "none";
  ok: boolean;
  status: number;
  durationMs: number;
  message?: string;
  hint?: string;
  data?: any;
}

async function timed(fn: () => Promise<Response>) {
  const t0 = Date.now();
  let resp: Response | null = null;
  let err: any = null;
  try { resp = await fn(); } catch (e) { err = e; }
  return { resp, err, durationMs: Date.now() - t0 };
}

function hintFor(status: number, body: any, endpoint: string): string | undefined {
  const code = body?.error?.code || body?.code;
  if (status === 401) {
    if (endpoint.startsWith("shares/")) {
      return "App token sem Sites.ReadWrite.All ou link em tenant diferente. Conceda admin consent ou use caminho /users/{upn}/drive/root:/...";
    }
    if (endpoint === "me") {
      return "Endpoint /me não funciona com token de aplicação. Use /users/{ONEDRIVE_USER_UPN}.";
    }
    return "Token inválido ou sem permissão. Verifique AZURE_CLIENT_SECRET e admin consent.";
  }
  if (status === 403) return "Permissões Graph insuficientes (Files.ReadWrite.All / Sites.ReadWrite.All).";
  if (status === 404) return "Recurso não encontrado — verifique ONEDRIVE_USER_UPN ou o caminho.";
  if (code === "invalidRequest" && endpoint.startsWith("shares/")) {
    return "Encoding base64url do shareUrl pode estar incorreto.";
  }
  return undefined;
}

async function runCheck(
  step: string,
  endpoint: string,
  init: RequestInit = {},
): Promise<Check> {
  let token: string;
  try {
    token = await getAppToken();
  } catch (e) {
    return {
      step,
      endpoint,
      tokenType: "none",
      ok: false,
      status: 0,
      durationMs: 0,
      message: e instanceof Error ? e.message : String(e),
      hint: "Configure AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.",
    };
  }
  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://graph.microsoft.com/v1.0/${endpoint.replace(/^\/+/, "")}`;
  const { resp, err, durationMs } = await timed(() => fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  }));
  if (err || !resp) {
    return {
      step, endpoint, tokenType: "app", ok: false, status: 0, durationMs,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  const text = await resp.text();
  let body: any;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  const ok = resp.ok && !body?.error;
  return {
    step,
    endpoint,
    tokenType: "app",
    ok,
    status: resp.status,
    durationMs,
    message: ok ? undefined : (body?.error?.message || body?.message || text.slice(0, 300)),
    hint: ok ? undefined : hintFor(resp.status, body, endpoint),
    data: ok ? {
      id: body?.id,
      name: body?.name,
      childCount: body?.value?.length,
    } : undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const shareUrl: string | undefined = body.shareUrl;

  const env = {
    AZURE_TENANT_ID: !!Deno.env.get("AZURE_TENANT_ID"),
    AZURE_CLIENT_ID: !!Deno.env.get("AZURE_CLIENT_ID"),
    AZURE_CLIENT_SECRET: !!Deno.env.get("AZURE_CLIENT_SECRET"),
    ONEDRIVE_USER_UPN: !!Deno.env.get("ONEDRIVE_USER_UPN"),
    MICROSOFT_ONEDRIVE_API_KEY: !!Deno.env.get("MICROSOFT_ONEDRIVE_API_KEY"),
    LOVABLE_API_KEY: !!Deno.env.get("LOVABLE_API_KEY"),
  };

  const checks: Check[] = [];
  let upn = "";
  try {
    upn = getAppCreds().userUpn;
  } catch (e) {
    checks.push({
      step: "credentials",
      endpoint: "(env)",
      tokenType: "none",
      ok: false,
      status: 0,
      durationMs: 0,
      message: e instanceof Error ? e.message : String(e),
      hint: "Adicione os secrets AZURE_* e ONEDRIVE_USER_UPN.",
    });
    return new Response(JSON.stringify({ success: false, env, checks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Token acquisition (implicit in first runCheck, but report separately)
  const t0 = Date.now();
  try {
    await getAppToken();
    checks.push({
      step: "azure_ad_token",
      endpoint: "login.microsoftonline.com/oauth2/v2.0/token",
      tokenType: "app",
      ok: true,
      status: 200,
      durationMs: Date.now() - t0,
      data: { scope: "https://graph.microsoft.com/.default" },
    });
  } catch (e) {
    checks.push({
      step: "azure_ad_token",
      endpoint: "login.microsoftonline.com/oauth2/v2.0/token",
      tokenType: "none",
      ok: false,
      status: 0,
      durationMs: Date.now() - t0,
      message: e instanceof Error ? e.message : String(e),
      hint: "Verifique AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET.",
    });
  }

  // 2. /me must FAIL for app tokens — this is expected behavior to confirm token type
  checks.push(await runCheck("me_should_fail", "me"));

  // 3. /users/{upn}
  checks.push(await runCheck("user_lookup", `users/${encodeURIComponent(upn)}`));

  // 4. /users/{upn}/drive/root
  checks.push(await runCheck("user_drive_root", `users/${encodeURIComponent(upn)}/drive/root`));

  // 5. /users/{upn}/drive/root/children
  checks.push(await runCheck("user_drive_children", `users/${encodeURIComponent(upn)}/drive/root/children?$select=id,name,folder&$top=10`));

  // 6. Path "Projeto RMA"
  checks.push(await runCheck("base_folder_projeto_rma", `users/${encodeURIComponent(upn)}/drive/root:/Projeto%20RMA`));

  // 7. Share URL resolution (only if provided)
  if (shareUrl) {
    const b64 = btoa(shareUrl).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
    checks.push(await runCheck("share_url_resolve", `shares/u!${b64}/driveItem`, {
      headers: { Prefer: "redeemSharingLink" },
    }));
  }

  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok && c.step !== "me_should_fail").length,
    tokenType: "app" as const,
    upn,
  };

  return new Response(JSON.stringify({ success: true, env, summary, checks }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
