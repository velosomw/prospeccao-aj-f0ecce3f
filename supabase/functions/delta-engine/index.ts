// delta-engine — Standalone Delta Engine endpoint
// Walks an arbitrary subfolder under "Projeto RMA" (recursive, depth-limited),
// classifies every file as new | updated | unchanged via the shared Delta Engine,
// upserts onedrive_files (which auto-enqueues via SQL trigger trg_enqueue_processing),
// and returns aggregated counts.
//
// Body (POST JSON):
//   {
//     path?: string;            // logical path inside base, e.g. "EmpresaA/2026/05.2026". Defaults to base root.
//     companyId?: string|null;
//     rmaId?: string|null;
//     ano?: number|null;
//     mes?: number|null;
//     batchSize?: number;       // default 10 (Delta Engine recommended)
//     maxDepth?: number;        // default 3 (avoids runaway recursion)
//     triggerWorker?: boolean;  // default true — fires process-queue after sync
//   }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ONEDRIVE_CONFIG,
  assertWithinBase,
  resolveRoot,
  listChildren,
  validateFile,
  audit,
} from "../_shared/onedrive.ts";
import {
  trackAndEnqueue,
  type OneDriveFileDescriptor,
} from "../_shared/delta-engine.ts";
import { graphErrorHttpStatus, toGraphErrorPayload } from "../_shared/graph-errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function triggerQueueWorker() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  fetch(`${url}/functions/v1/process-queue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify({ batch_size: 5 }),
  }).catch((e) => console.error("triggerQueueWorker failed", e));
}

interface WalkItem {
  item: any;
  path: string; // logical path including base
}

async function walk(
  driveId: string,
  itemId: string,
  basePath: string,
  depth: number,
  maxDepth: number,
  out: WalkItem[],
) {
  if (depth > maxDepth) return;
  const kids = await listChildren(driveId, itemId);
  for (const k of kids) {
    const p = `${basePath}/${k.name}`;
    if (k.file) out.push({ item: k, path: p });
    else if (k.folder) await walk(driveId, k.id, p, depth + 1, maxDepth, out);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const {
      path = "",
      companyId = null,
      rmaId = null,
      ano = null,
      mes = null,
      batchSize = 10,
      maxDepth = 3,
      triggerWorker = true,
    }: {
      path?: string;
      companyId?: string | null;
      rmaId?: string | null;
      ano?: number | null;
      mes?: number | null;
      batchSize?: number;
      maxDepth?: number;
      triggerWorker?: boolean;
    } = body;

    const root = await resolveRoot();
    if (!root.driveId || !root.itemId) throw new Error("Pasta base 'Projeto RMA' não resolvida");

    // Resolve sub-path segment by segment (skip empty)
    let cursorId = root.itemId;
    let cursorPath = ONEDRIVE_CONFIG.base_path;
    const segments = path.split("/").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      const kids = await listChildren(root.driveId, cursorId);
      const node = kids.find((k: any) => k.name === seg && k.folder);
      if (!node) throw new Error(`Pasta não encontrada: ${cursorPath}/${seg}`);
      cursorId = node.id;
      cursorPath += `/${seg}`;
    }
    assertWithinBase(cursorPath);

    // Walk the subtree
    const all: WalkItem[] = [];
    await walk(root.driveId, cursorId, cursorPath, 0, Math.max(0, Number(maxDepth) || 0), all);

    const counts = { new: 0, updated: 0, unchanged: 0, invalid: 0 };
    const SAMPLE: any[] = [];
    const BATCH = Math.min(Math.max(Number(batchSize) || 10, 1), 25);

    async function processOne(w: WalkItem) {
      const item = w.item;
      const name = item.name as string;
      const size = item.size || 0;
      let ext = (name.split(".").pop() || "").toLowerCase();
      try {
        ext = validateFile(name, size).ext;
      } catch (e) {
        return { bucket: "invalid" as const, reason: (e as Error).message, name };
      }

      const descriptor: OneDriveFileDescriptor = {
        file_id: item.id,
        drive_id: root.driveId,
        path: w.path,
        file_name: name,
        file_type: ext,
        mime_type: item.file?.mimeType ?? null,
        size_bytes: size,
        etag: item.eTag ?? item.cTag ?? null,
        ctag: item.cTag ?? null,
        last_modified: item.lastModifiedDateTime ?? null,
        company_id: companyId,
        rma_id: rmaId,
        ano,
        mes,
        metadata: { source: "delta-engine", scan_path: cursorPath },
      };

      const decision = await trackAndEnqueue(descriptor);
      // Map "ignore" → "unchanged" for the public Delta Engine contract
      const bucket = decision.action === "ignore" ? "unchanged" : decision.action;
      return { bucket, reason: decision.reason, name };
    }

    for (let i = 0; i < all.length; i += BATCH) {
      const batch = all.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map(processOne));
      for (const s of settled) {
        if (s.status === "fulfilled") {
          counts[s.value.bucket]++;
          if (SAMPLE.length < 50) SAMPLE.push(s.value);
        } else {
          counts.invalid++;
          console.error("delta-engine processOne failed", s.reason);
        }
      }
    }

    if (triggerWorker && (counts.new + counts.updated > 0)) triggerQueueWorker();

    await audit({
      documentId: null,
      step: "delta_engine_scan",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: { path: cursorPath, totals: counts, scanned: all.length, batchSize: BATCH },
    });

    return new Response(JSON.stringify({
      success: true,
      path: cursorPath,
      scanned: all.length,
      ...counts, // { new, updated, unchanged, invalid }
      enqueued: counts.new + counts.updated,
      sample: SAMPLE,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("delta-engine error", e);
    const payload = toGraphErrorPayload(e);
    await audit({
      documentId: null,
      step: "delta_engine_scan",
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: payload.error,
      details: { category: payload.category, graphStatus: payload.graphStatus, endpoint: payload.endpoint },
    });
    return new Response(JSON.stringify(payload), {
      status: graphErrorHttpStatus(payload),
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
