// incremental-agent — Phase 2 OneDrive Reconciliation Agent
// ------------------------------------------------------------
// Stateless decision endpoint. Receives current_scan + previous_state
// (or fetches previous_state from onedrive_files when omitted) and
// returns a deterministic processing_queue.
//
// POST body:
// {
//   "current_scan": [...],
//   "previous_state": [...]?,    // optional; auto-loaded by file_id when missing
//   "context": {
//     "high_priority_paths": ["balancete","dre"],
//     "recent_modification_window_hours": 48,
//     "large_file_threshold_bytes": 52428800
//   },
//   "apply": false               // when true, persists queue via processing_queue + marks DELETED inactive
// }
//
// Output (always):
// { processing_queue: [...], summary: {...} }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  reconcile,
  type AgentInput,
  type AgentPreviousState,
  type AgentDecision,
} from "../_shared/incremental-agent.ts";

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
        processing_queue: [],
        summary: { total: 0, new: 0, modified: 0, unchanged: 0, deleted: 0, queued: 0 },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let previous_state: AgentPreviousState[] = Array.isArray(body.previous_state)
      ? body.previous_state
      : [];

    // Auto-load previous_state from DB when not supplied
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

    const input: AgentInput = {
      current_scan,
      previous_state,
      context: body.context ?? undefined,
    };

    const result = reconcile(input);

    // Optional: persist results
    if (body.apply === true) {
      const client = sb();
      // Enqueue items needing action (skip ARCHIVE here — handled by mark_missing_files_inactive)
      const toEnqueue = result.processing_queue.filter(
        (d: AgentDecision) => d.action === "PROCESS" || d.action === "REPROCESS",
      );

      // De-dup against pending/processing
      if (toEnqueue.length > 0) {
        const fileIds = toEnqueue.map((d) => d.file_id);
        const { data: existing } = await client
          .from("processing_queue")
          .select("file_id")
          .in("file_id", fileIds)
          .in("status", ["pending", "processing"]);
        const skip = new Set((existing ?? []).map((r: any) => r.file_id));

        const rows = toEnqueue
          .filter((d) => !skip.has(d.file_id))
          .map((d) => {
            const cur = current_scan.find((c: any) => c.file_id === d.file_id);
            return {
              file_id: d.file_id,
              reason: d.action.toLowerCase(),
              status: "pending",
              priority: d.priority_score,
              payload: {
                agent: "incremental-agent",
                classification: d.classification,
                priority_label: d.priority,
                reason: d.reason,
                next_version: d.next_version,
                path: cur?.path,
                file_name: cur?.file_name,
              },
            };
          });

        if (rows.length > 0) {
          await client.from("processing_queue").insert(rows);
        }
      }

      // Archive DELETED → flip status=inactive
      const archiveIds = result.processing_queue
        .filter((d) => d.action === "ARCHIVE")
        .map((d) => d.file_id);
      if (archiveIds.length > 0) {
        await client.from("onedrive_files")
          .update({ status: "inactive" })
          .in("file_id", archiveIds);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("incremental-agent error", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
