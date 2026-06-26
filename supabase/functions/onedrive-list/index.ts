import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { graph, assertWithinBase, ONEDRIVE_CONFIG } from "../_shared/onedrive.ts";
import { graphErrorHttpStatus, toGraphErrorPayload } from "../_shared/graph-errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const upn = Deno.env.get("ONEDRIVE_USER_UPN") ?? "";
    const defaultPath = upn ? `users/${encodeURIComponent(upn)}/drive/root/children` : "me/drive/root/children";
    let { path = defaultPath, method = "GET", enforceBase = false } =
      await req.json().catch(() => ({}));
    // Auto-rewrite "me/..." to "users/<UPN>/..." since we run in Application mode
    if (upn && path.startsWith("me/")) path = `users/${encodeURIComponent(upn)}/` + path.slice(3);
    if (upn && path === "me") path = `users/${encodeURIComponent(upn)}`;

    // Optional path restriction (off for raw API exploration, on for app usage)
    if (enforceBase) {
      // try to extract a /root:/<path>: segment for guard
      const m = path.match(/root:\/([^:]+):/);
      if (m) assertWithinBase(decodeURIComponent(m[1]));
    }

    const data = await graph(path, { method });
    return new Response(JSON.stringify({
      success: true,
      key_used: "MICROSOFT_ONEDRIVE_API_KEY",
      base_path: ONEDRIVE_CONFIG.base_path,
      data,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("onedrive-list error:", e);
    const payload = toGraphErrorPayload(e);
    return new Response(JSON.stringify(payload), { status: graphErrorHttpStatus(payload), headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
