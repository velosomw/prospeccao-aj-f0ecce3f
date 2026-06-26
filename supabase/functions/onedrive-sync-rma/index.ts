import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  ONEDRIVE_CONFIG,
  ALL_OPERATIONAL_FOLDER_NAMES,
  assertWithinBase,
  resolveRoot,
  listChildren,
  ensureFolder,
  ensureOperationalSubfolders,
  validateFile,
  audit,
  getServiceClient,
} from "../_shared/onedrive.ts";
import { trackAndEnqueue, type OneDriveFileDescriptor } from "../_shared/delta-engine.ts";
import { graphErrorHttpStatus, toGraphErrorPayload } from "../_shared/graph-errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Trigger background processor (one row from queue) — fire & forget
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

interface FileDelta {
  file_id: string;
  name: string;
  size: number;
  ext: string;
  valid: boolean;
  validationError?: string;
  action: "new" | "updated" | "ignore" | "invalid";
  reason: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();

  // scanId opcional injetado pelo monitor para correlacionar varreduras
  const reqScanId = (req.headers.get("x-scan-id") || "").trim() || null;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      rmaId = "RMA-001",
      companyId = null,
      shareUrl,
      clientName,
      clientFolder,
      year = new Date().getFullYear(),
      month,
      period,
      ensureSubfolders = true,
      scanId: bodyScanId = null,
    } = body;
    const scanId: string = (bodyScanId ?? reqScanId ?? crypto.randomUUID()) as string;

    const effectiveClient = clientName ?? clientFolder ?? null;
    const yearNum = Number(year);
    const monthNum = month != null ? Number(month) : null;
    const periodStr = monthNum != null
      ? `${String(monthNum).padStart(2, "0")}.${yearNum}`
      : String(period ?? "ANUAL");

    const log: string[] = [];
    log.push(`Sync RMA=${rmaId} cliente=${effectiveClient ?? "(raiz)"} ano=${yearNum} per=${periodStr}`);

    // Resolve folder hierarchy
    const root = await resolveRoot(shareUrl);
    if (!root.driveId || !root.itemId) throw new Error("Pasta base 'Projeto RMA' não resolvida");

    let cursorId = root.itemId;
    let cursorPath = ONEDRIVE_CONFIG.base_path;

    if (effectiveClient) {
      const rootKids = await listChildren(root.driveId, cursorId);
      let clientNode = rootKids.find((k: any) => k.name === effectiveClient && k.folder);
      if (!clientNode) {
        const created = await ensureFolder(root.driveId, cursorId, effectiveClient);
        clientNode = { id: created.id };
      }
      cursorId = clientNode.id;
      cursorPath += `/${effectiveClient}`;
    }

    const yearChildren = await listChildren(root.driveId, cursorId);
    let yearNode = yearChildren.find((c: any) => c.name === String(yearNum) && c.folder);
    if (!yearNode) {
      yearNode = await ensureFolder(root.driveId, cursorId, String(yearNum)).then((r) => ({ id: r.id }));
    }
    cursorId = yearNode.id;
    cursorPath += `/${yearNum}`;

    const periodChildren = await listChildren(root.driveId, cursorId);
    let periodNode = periodChildren.find((c: any) => c.name === periodStr && c.folder);
    if (!periodNode) {
      periodNode = await ensureFolder(root.driveId, cursorId, periodStr).then((r) => ({ id: r.id }));
    }
    cursorId = periodNode.id;
    cursorPath += `/${periodStr}`;

    assertWithinBase(cursorPath);

    let operational: Record<string, string> = {};
    if (ensureSubfolders) {
      operational = await ensureOperationalSubfolders(root.driveId, cursorId);
    }

    // Collect files (flat mode preferred; fallback to per-topic subfolders)
    const periodKids = await listChildren(root.driveId, cursorId);
    const operationalLower = new Set(
      Array.from(ALL_OPERATIONAL_FOLDER_NAMES).map((n) => n.toLowerCase()),
    );
    const topicFolders = periodKids.filter(
      (c: any) => c.folder && !operationalLower.has((c.name ?? "").toLowerCase()),
    );
    const looseFiles = periodKids.filter((c: any) => c.file);

    const allItems: { folder: string | null; item: any }[] = [];
    if (topicFolders.length === 0 && looseFiles.length > 0) {
      for (const f of looseFiles) allItems.push({ folder: null, item: f });
    } else {
      for (const tf of topicFolders) {
        const items = await listChildren(root.driveId, tf.id);
        for (const f of items.filter((it: any) => it.file)) allItems.push({ folder: tf.name, item: f });
      }
    }

    const supabase = getServiceClient();
    const deltas: FileDelta[] = [];
    let counts = { new: 0, updated: 0, ignored: 0, invalid: 0 };

    // Paralelismo controlado — Delta Engine recomenda batches para reduzir latência
    // mantendo o número de conexões DB / Graph sob controle.
    const BATCH_SIZE = 10;

    async function processOne({ folder, item }: { folder: string | null; item: any }) {
      const name = item.name as string;
      const size = item.size || 0;

      let ext = (name.split(".").pop() || "").toLowerCase();
      try {
        const v = validateFile(name, size);
        ext = v.ext;
      } catch (e) {
        const validationError = e instanceof Error ? e.message : String(e);
        return {
          delta: {
            file_id: item.id, name, size, ext, valid: false, validationError,
            action: "invalid" as const, reason: validationError,
          },
          bucket: "invalid" as const,
        };
      }

      const descriptor: OneDriveFileDescriptor = {
        file_id: item.id,
        drive_id: root.driveId,
        path: `${cursorPath}${folder ? `/${folder}` : ""}/${name}`,
        file_name: name,
        file_type: ext,
        mime_type: item.file?.mimeType ?? null,
        size_bytes: size,
        etag: item.eTag ?? item.cTag ?? null,
        ctag: item.cTag ?? null,
        last_modified: item.lastModifiedDateTime ?? null,
        company_id: companyId,
        rma_id: rmaId,
        ano: yearNum,
        mes: monthNum,
        metadata: { topic_folder: folder, sync_path: cursorPath },
      };

      const decision = await trackAndEnqueue(descriptor, { scanId });

      // Garante 1 linha de pipeline_documents por (rma_id, external_id),
      // independente do delta. Files reutilizados em períodos diferentes
      // (ex.: mesmo extrato bancário em Dez/2025 e Jan/2026) precisam de
      // uma linha própria para cada RMA — senão o worker persiste resultado
      // no RMA errado.
      const { data: existingDoc } = await supabase
        .from("pipeline_documents")
        .select("id")
        .eq("rma_id", rmaId)
        .eq("external_id", item.id)
        .maybeSingle();
      if (!existingDoc) {
        await supabase.from("pipeline_documents").insert({
          rma_id: rmaId,
          file_name: name,
          mime_type: item.file?.mimeType ?? "application/octet-stream",
          file_size: size,
          sha256_hash: `onedrive:${item.id}`,
          provider: "onedrive",
          external_id: item.id,
          pipeline_status: "pending",
          pipeline_step: 0,
        });
      }


      return {
        delta: {
          file_id: item.id, name, size, ext, valid: true,
          action: decision.action, reason: decision.reason,
        },
        bucket: (decision.action === "ignore" ? "ignored" : decision.action) as
          "new" | "updated" | "ignored",
      };
    }

    for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
      const batch = allItems.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(batch.map(processOne));
      for (const s of settled) {
        if (s.status === "fulfilled") {
          counts[s.value.bucket]++;
          deltas.push(s.value.delta);
        } else {
          counts.invalid++;
          console.error("processOne failed:", s.reason);
        }
      }
    }

    // Detecção de removidos: marca como inactive os que não foram vistos neste scan
    let inactiveCount = 0;
    try {
      const { data: inact } = await supabase.rpc("mark_missing_files_inactive", {
        p_scan_id: scanId,
        p_company_id: companyId,
        p_rma_id: rmaId,
        p_folder_prefix: cursorPath,
      });
      inactiveCount = (inact as number) ?? 0;
    } catch (e) {
      console.warn("[sync-rma] mark_missing_files_inactive falhou:", e);
    }

    // Trigger queue worker if there's anything to do
    if (counts.new + counts.updated > 0) triggerQueueWorker();

    const summary = {
      totalFiles: allItems.length,
      ...counts,
      inactive: inactiveCount,
      enqueued: counts.new + counts.updated,
      scan_id: scanId,
    };

    log.push(`Delta: NEW=${counts.new} UPDATED=${counts.updated} IGNORED=${counts.ignored} INVALID=${counts.invalid} INACTIVE=${inactiveCount}`);

    // Registra varredura para histórico/métricas
    await supabase.from("onedrive_scan_runs").insert({
      scan_id: scanId,
      source: reqScanId ? "monitor_cron" : "sync_rma",
      company_id: companyId,
      rma_id: rmaId,
      ano: yearNum,
      mes: monthNum,
      folder_path: cursorPath,
      files_scanned: allItems.length,
      files_new: counts.new,
      files_updated: counts.updated,
      files_ignored: counts.ignored,
      files_invalid: counts.invalid,
      files_inactive: inactiveCount,
      duration_ms: Date.now() - startedAt,
      status: "success",
    });

    await audit({
      documentId: null,
      step: "onedrive_sync_rma",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: { rmaId, path: cursorPath, summary },
    });

    return new Response(JSON.stringify({
      success: true,
      rmaId,
      path: cursorPath,
      operationalSubfolders: operational,
      summary,
      deltas,
      log,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("onedrive-sync-rma error:", e);
    const payload = toGraphErrorPayload(e);
    await audit({
      documentId: null,
      step: "onedrive_sync_rma",
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: payload.error,
      details: {
        category: payload.category,
        graphStatus: payload.graphStatus,
        endpoint: payload.endpoint,
      },
    });
    return new Response(JSON.stringify(payload), {
      status: graphErrorHttpStatus(payload),
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
