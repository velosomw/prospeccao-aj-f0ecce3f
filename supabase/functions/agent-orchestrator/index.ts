// agent-orchestrator — Multi-agent decision endpoint
// ------------------------------------------------------------
// POST body:
// {
//   "current_scan": [...],
//   "previous_state"?: [...],   // auto-loaded from onedrive_files when omitted
//   "context"?: {...},
//   "apply"?: false             // when true, persists tasks into processing_queue with route metadata
// }
//
// Returns: { tasks: OrchestratorTask[], summary }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { orchestrate, type OrchestratorTask } from "../_shared/orchestrator.ts";
import type { AgentPreviousState } from "../_shared/incremental-agent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const current_scan = Array.isArray(body.current_scan) ? body.current_scan : [];
    if (current_scan.length === 0) {
      return new Response(JSON.stringify({
        tasks: [],
        summary: { total: 0, high: 0, medium: 0, low: 0, by_route: {} },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let previous_state: AgentPreviousState[] = Array.isArray(body.previous_state)
      ? body.previous_state
      : [];

    if (previous_state.length === 0) {
      const ids = current_scan.map((c: any) => c.file_id).filter(Boolean);
      const { data } = await sb()
        .from("onedrive_files")
        .select("file_id,etag,last_modified,last_processed_at,version,status,size_bytes")
        .in("file_id", ids);
      previous_state = (data ?? []).map((r: any) => ({
        file_id: r.file_id,
        etag: r.etag,
        last_modified: r.last_modified,
        last_processed: r.last_processed_at,
        version: r.version,
        status: r.status,
        size: r.size_bytes,
      }));
    }

    const plan = orchestrate({
      current_scan,
      previous_state,
      context: body.context,
    });

    if (body.apply === true) {
      const client = sb();
      const toEnqueue = plan.tasks.filter(
        (t: OrchestratorTask) => t.route.length > 0 && (t.action === "PROCESS" || t.action === "REPROCESS"),
      );
      if (toEnqueue.length > 0) {
        const fileIds = toEnqueue.map((t) => t.file_id);
        const { data: existing } = await client
          .from("processing_queue")
          .select("file_id")
          .in("file_id", fileIds)
          .in("status", ["pending", "processing"]);
        const skip = new Set((existing ?? []).map((r: any) => r.file_id));

        const rows = toEnqueue
          .filter((t) => !skip.has(t.file_id))
          .map((t) => {
            const cur = current_scan.find((c: any) => c.file_id === t.file_id);
            return {
              file_id: t.file_id,
              reason: t.action.toLowerCase(),
              status: "pending",
              priority: t.priority_score,
              payload: {
                orchestrator: "agent-orchestrator",
                route: t.route,
                priority_label: t.priority,
                classification: t.classification,
                document_type_hint: t.document_type_hint ?? null,
                reason: t.reason,
                path: cur?.path,
                file_name: cur?.file_name,
              },
            };
          });
        if (rows.length > 0) await client.from("processing_queue").insert(rows);
      }

      const archiveIds = plan.tasks
        .filter((t) => t.action === "ARCHIVE")
        .map((t) => t.file_id);
      if (archiveIds.length > 0) {
        await client.from("onedrive_files")
          .update({ status: "inactive" })
          .in("file_id", archiveIds);
      }
    }

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("agent-orchestrator error", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
