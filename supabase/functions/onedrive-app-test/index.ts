// Diagnostic endpoint for the Application-mode OneDrive integration.
// Validates: token issuance → user resolution → drive access → base folder presence.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAppToken, getAppCreds, graphApp, getUserDriveRoot, getFolderByPath } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const checks: any[] = [];
  const record = (name: string, status: "ok" | "fail" | "warn", details: any) =>
    checks.push({ name, status, details });

  try {
    // 1. Env vars
    const creds = getAppCreds();
    record("env_vars", "ok", {
      tenantId: creds.tenantId,
      clientId: creds.clientId,
      userUpn: creds.userUpn,
      clientSecret: `${creds.clientSecret.slice(0, 4)}...${creds.clientSecret.slice(-4)}`,
    });

    // 2. Token
    let token: string;
    try {
      token = await getAppToken();
      record("azure_ad_token", "ok", { length: token.length, preview: `${token.slice(0, 20)}...` });
    } catch (e) {
      record("azure_ad_token", "fail", { error: (e as Error).message });
      throw e;
    }

    // 3. User resolution
    try {
      const u = await graphApp<any>(`users/${encodeURIComponent(creds.userUpn)}`);
      record("user_lookup", "ok", { id: u.id, displayName: u.displayName, mail: u.mail, upn: u.userPrincipalName });
    } catch (e) {
      record("user_lookup", "fail", { error: (e as Error).message, hint: "Check User.Read.All permission + admin consent" });
    }

    // 4. Drive access
    try {
      const drive = await getUserDriveRoot();
      record("drive_root", "ok", drive);
    } catch (e) {
      record("drive_root", "fail", {
        error: (e as Error).message,
        hint: "User may not have OneDrive provisioned, or Files.ReadWrite.All not granted",
      });
    }

    // 5. Base folder "Projeto RMA"
    try {
      const folder = await getFolderByPath("Projeto RMA");
      record("base_folder", "ok", folder);
    } catch (e) {
      record("base_folder", "warn", {
        error: (e as Error).message,
        hint: "Create the folder 'Projeto RMA' at the root of the user's OneDrive",
      });
    }

    return new Response(JSON.stringify({ success: true, checks }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
      checks,
    }, null, 2), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
