// Watchdog: marca como `failed` jobs em `processing` sem update há >10min.
// Também marca itens da processing_queue 'processing' órfãos como 'error'.
// Roda via pg_cron a cada 5 minutos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STALE_MINUTES = Number(Deno.env.get("WATCHDOG_STALE_MINUTES") ?? "10");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const errMsg = `Watchdog: job sem progresso há >${STALE_MINUTES}min (worker abandonou)`;

  const { data: aiData, error: aiErr } = await supabase
    .from("ai_extractions")
    .update({ status: "failed", error_message: errMsg, updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .select("id");

  const { data: qData, error: qErr } = await supabase
    .from("processing_queue")
    .update({ status: "error", error_message: errMsg, updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .select("id");

  const result = {
    ok: !aiErr && !qErr,
    cutoff,
    ai_extractions_failed: aiData?.length ?? 0,
    processing_queue_errored: qData?.length ?? 0,
    errors: [aiErr?.message, qErr?.message].filter(Boolean),
  };

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
