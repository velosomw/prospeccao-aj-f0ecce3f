// Diagnóstico: lista todos os processors do projeto/região configurados
import { getGcpAccessToken } from "../_shared/gcp-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const project = Deno.env.get("GCP_PROJECT_ID") || "";
    const location = (Deno.env.get("GCP_LOCATION") || "us").toLowerCase();
    const configuredId = Deno.env.get("GCP_DOCAI_PROCESSOR_ID") || "";

    const token = await getGcpAccessToken();
    const url = `https://${location}-documentai.googleapis.com/v1/projects/${project}/locations/${location}/processors`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await resp.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }

    return new Response(JSON.stringify({
      project, location, configured_processor_id: configuredId,
      list_url: url, status: resp.status, body,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
