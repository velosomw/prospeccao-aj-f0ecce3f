// Delta Engine — detects NEW/UPDATED/IGNORE for OneDrive files
// and maintains onedrive_files + processing_queue tables.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type DeltaAction = "new" | "updated" | "ignore";

export interface OneDriveFileDescriptor {
  file_id: string;          // Graph item id
  drive_id?: string | null;
  path: string;             // logical path (e.g. /Projeto RMA/Empresa/2026/05.2026/foo.pdf)
  file_name: string;
  file_type?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  etag?: string | null;
  ctag?: string | null;
  last_modified?: string | null; // ISO
  company_id?: string | null;
  rma_id?: string | null;
  ano?: number | null;
  mes?: number | null;
  metadata?: Record<string, unknown>;
}

export interface DeltaResult {
  action: DeltaAction;
  reason: string;
  previous?: { etag?: string | null; last_modified?: string | null; version: number };
  next_version: number;
}

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

/**
 * Decide whether a file is NEW, UPDATED or should be IGNORED.
 * Pure decision — does not write to DB.
 */
export function decideDelta(
  current: OneDriveFileDescriptor,
  existing: { etag?: string | null; last_modified?: string | null; last_processed_at?: string | null; version?: number; status?: string | null } | null,
): DeltaResult {
  if (!existing) {
    return { action: "new", reason: "file not seen before", next_version: 1 };
  }
  const etagChanged = current.etag && existing.etag && current.etag !== existing.etag;
  const modifiedAfterProcessing =
    current.last_modified &&
    existing.last_processed_at &&
    new Date(current.last_modified).getTime() > new Date(existing.last_processed_at).getTime();
  const neverProcessed = !existing.last_processed_at && existing.status !== "processed";

  if (etagChanged) {
    return {
      action: "updated",
      reason: `etag changed (${existing.etag} → ${current.etag})`,
      previous: { etag: existing.etag, last_modified: existing.last_modified, version: existing.version ?? 1 },
      next_version: (existing.version ?? 1) + 1,
    };
  }
  if (modifiedAfterProcessing) {
    return {
      action: "updated",
      reason: `last_modified > last_processed_at`,
      previous: { etag: existing.etag, last_modified: existing.last_modified, version: existing.version ?? 1 },
      next_version: (existing.version ?? 1) + 1,
    };
  }
  if (neverProcessed) {
    return {
      action: "updated",
      reason: "tracked but never processed",
      previous: { etag: existing.etag, last_modified: existing.last_modified, version: existing.version ?? 1 },
      next_version: existing.version ?? 1,
    };
  }
  return { action: "ignore", reason: "unchanged since last processing", next_version: existing.version ?? 1 };
}

/**
 * Upsert tracker row and enqueue if needed.
 * Returns the delta decision so the caller can log/aggregate.
 */
export async function trackAndEnqueue(
  file: OneDriveFileDescriptor,
  opts: { priority?: number; reasonOverride?: DeltaAction; scanId?: string | null } = {},
): Promise<DeltaResult> {
  const sb = getServiceClient();
  const { data: existing } = await sb
    .from("onedrive_files")
    .select("etag,last_modified,last_processed_at,version,status")
    .eq("file_id", file.file_id)
    .maybeSingle();

  const decision = decideDelta(file, existing as any);
  const action = opts.reasonOverride ?? decision.action;

  // ETAG GUARD: se nada mudou (action=ignore) só atualiza last_seen_at/last_scan_id.
  // Elimina ~80% dos upserts pesados em scans incrementais.
  if (action === "ignore" && existing) {
    await sb
      .from("onedrive_files")
      .update({
        last_seen_at: new Date().toISOString(),
        last_scan_id: opts.scanId ?? null,
      })
      .eq("file_id", file.file_id);
  } else {
    await sb.from("onedrive_files").upsert({
      file_id: file.file_id,
      drive_id: file.drive_id ?? null,
      company_id: file.company_id ?? null,
      rma_id: file.rma_id ?? null,
      path: file.path,
      file_name: file.file_name,
      file_type: file.file_type ?? null,
      mime_type: file.mime_type ?? null,
      size_bytes: file.size_bytes ?? null,
      etag: file.etag ?? null,
      ctag: file.ctag ?? null,
      ano: file.ano ?? null,
      mes: file.mes ?? null,
      last_modified: file.last_modified ?? null,
      last_seen_at: new Date().toISOString(),
      last_scan_id: opts.scanId ?? null,
      version: decision.next_version,
      status: "queued",
      metadata: file.metadata ?? {},
    }, { onConflict: "file_id" });
  }

  if (action !== "ignore") {
    // Prioridade inteligente alinhada ao Incremental Agent:
    //  NEW=10, MODIFIED em path crítico ou modificado <48h=10,
    //  retry pós-erro=7, MODIFIED comum=8, grande sem urgência=3.
    const HIGH_PATH_HINTS = ["balancete", "balanco", "dre", "dfc", "razao", "razão"];
    const lowerPath = (file.path || "").toLowerCase();
    const isHighPath = HIGH_PATH_HINTS.some((h) => lowerPath.includes(h));
    const recentlyModified = !!file.last_modified &&
      (Date.now() - new Date(file.last_modified).getTime() < 48 * 3600_000);
    const isLarge = (file.size_bytes ?? 0) > 50 * 1024 * 1024;
    const prevError = (existing as any)?.status === "error";

    let smartPriority: number;
    if (action === "new") smartPriority = 10;
    else if (isHighPath || recentlyModified) smartPriority = 10;
    else if (prevError) smartPriority = 7;
    else if (isLarge) smartPriority = 3;
    else smartPriority = 8;
    smartPriority = opts.priority ?? smartPriority;

    // Dedup: skip enqueue if there is already a pending/processing job for this file
    const { data: existingJob } = await sb
      .from("processing_queue")
      .select("id")
      .eq("file_id", file.file_id)
      .in("status", ["pending", "processing"])
      .limit(1)
      .maybeSingle();
    if (existingJob) {
      return decision;
    }

    await sb.from("processing_queue").insert({
      file_id: file.file_id,
      company_id: file.company_id ?? null,
      rma_id: file.rma_id ?? null,
      ano: file.ano ?? null,
      mes: file.mes ?? null,
      reason: action,
      status: "pending",
      priority: smartPriority,
      payload: {
        path: file.path,
        file_name: file.file_name,
        delta_reason: decision.reason,
        previous_version: decision.previous?.version ?? null,
        scan_id: opts.scanId ?? null,
      },
    });
  }

  return decision;
}

/**
 * Mark a file as successfully processed.
 */
export async function markProcessed(file_id: string) {
  const sb = getServiceClient();
  await sb.from("onedrive_files").update({
    status: "processed",
    last_processed_at: new Date().toISOString(),
    error_message: null,
  }).eq("file_id", file_id);
}

/**
 * Mark a file as errored.
 */
export async function markError(file_id: string, errorMessage: string) {
  const sb = getServiceClient();
  await sb.from("onedrive_files").update({
    status: "error",
    error_message: errorMessage,
  }).eq("file_id", file_id);
}
