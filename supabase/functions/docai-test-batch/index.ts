import { getGcpAccessToken } from "../_shared/gcp-auth.ts";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve(async () => {
  const token = await getGcpAccessToken();
  const url = `https://us-documentai.googleapis.com/v1/projects/verdemar-brasil/locations/us/processors/4e39bd0b65953073:batchProcess`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      inputDocuments: { gcsDocuments: { documents: [{ gcsUri: "gs://nonexistent/test.pdf", mimeType: "application/pdf" }] } },
      documentOutputConfig: { gcsOutputConfig: { gcsUri: "gs://nonexistent/out/" } },
    }),
  });
  return new Response(JSON.stringify({ status: resp.status, body: await resp.text(), url }), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
});
