// Incremental Reconciliation Agent — OneDrive
// ------------------------------------------------------------
// Deterministic specialist agent that classifies files based ONLY
// on metadata + previous state. It does NOT process anything,
// it only DECIDES, CLASSIFIES and PRIORITIZES.
//
// Spec contract (input/output) follows the agent prompt:
//   classification: NEW | MODIFIED | UNCHANGED | DELETED
//   action:         PROCESS | REPROCESS | IGNORE | ARCHIVE
//   priority:       HIGH | MEDIUM | LOW
//
// Anti-hallucination rules:
//   - Never infer file content
//   - Never assume errors without evidence
//   - When in doubt → IGNORE (conservative)
//   - Use only metadata provided
// ------------------------------------------------------------

export type Classification = "NEW" | "MODIFIED" | "UNCHANGED" | "DELETED";
export type AgentAction = "PROCESS" | "REPROCESS" | "IGNORE" | "ARCHIVE";
export type AgentPriority = "HIGH" | "MEDIUM" | "LOW";

export interface AgentCurrentFile {
  file_id: string;
  path?: string;
  file_name?: string;
  last_modified?: string | null; // ISO
  size?: number | null;
  hash?: string | null;
  etag?: string | null;
  mime_type?: string | null;
}

export interface AgentPreviousState {
  file_id: string;
  last_modified?: string | null;
  hash?: string | null;
  etag?: string | null;
  last_processed?: string | null; // ISO
  status?: string | null;          // processed | error | queued | inactive | ...
  version?: number | null;
  size?: number | null;
}

export interface AgentDecision {
  file_id: string;
  classification: Classification;
  action: AgentAction;
  priority: AgentPriority;
  priority_score: number; // numeric for queue ordering (HIGH=10, MEDIUM=6, LOW=3)
  reason: string;
  next_version: number;
}

export interface AgentInput {
  current_scan: AgentCurrentFile[];
  previous_state: AgentPreviousState[];
  // Business context (optional, for adaptive priority)
  context?: {
    high_priority_paths?: string[];   // e.g. ["balancete", "dre", "razao"]
    large_file_threshold_bytes?: number;
    recent_modification_window_hours?: number; // default 48h
  };
}

export interface AgentOutput {
  processing_queue: AgentDecision[];
  summary: {
    total: number;
    new: number;
    modified: number;
    unchanged: number;
    deleted: number;
    queued: number; // NEW + MODIFIED + DELETED-archive items requiring action
  };
}

const DEFAULT_HIGH_PATHS = ["balancete", "balanco", "dre", "dfc", "razao", "razão"];

function isHighPriorityPath(path: string | undefined, hints: string[]): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return hints.some((h) => lower.includes(h));
}

function recentlyModified(lastModified: string | null | undefined, windowHours: number): boolean {
  if (!lastModified) return false;
  const t = new Date(lastModified).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < windowHours * 3600_000;
}

/**
 * Pure decision function. Receives the two states and returns the queue.
 * Deterministic. No AI calls, no side effects.
 */
export function reconcile(input: AgentInput): AgentOutput {
  const ctx = input.context ?? {};
  const highHints = ctx.high_priority_paths?.map((h) => h.toLowerCase()) ?? DEFAULT_HIGH_PATHS;
  const recentWindow = ctx.recent_modification_window_hours ?? 48;
  const largeBytes = ctx.large_file_threshold_bytes ?? 50 * 1024 * 1024; // 50MB

  const prevById = new Map(input.previous_state.map((p) => [p.file_id, p]));
  const curById = new Map(input.current_scan.map((c) => [c.file_id, c]));

  const decisions: AgentDecision[] = [];

  // 1. Classify current files (NEW / MODIFIED / UNCHANGED)
  for (const cur of input.current_scan) {
    const prev = prevById.get(cur.file_id);

    if (!prev) {
      decisions.push({
        file_id: cur.file_id,
        classification: "NEW",
        action: "PROCESS",
        priority: "HIGH",
        priority_score: 10,
        reason: "Novo arquivo detectado",
        next_version: 1,
      });
      continue;
    }

    // Compare metadata (etag > hash > last_modified)
    const etagChanged = !!cur.etag && !!prev.etag && cur.etag !== prev.etag;
    const hashChanged = !!cur.hash && !!prev.hash && cur.hash !== prev.hash;
    const modifiedAfterProcess =
      !!cur.last_modified &&
      !!prev.last_processed &&
      new Date(cur.last_modified).getTime() > new Date(prev.last_processed).getTime();
    const neverProcessed = !prev.last_processed && prev.status !== "processed";

    if (etagChanged || hashChanged || modifiedAfterProcess) {
      // MODIFIED → REPROCESS
      const prevHadError = prev.status === "error";
      const isHighPath = isHighPriorityPath(cur.path, highHints);
      const isRecent = recentlyModified(cur.last_modified, recentWindow);
      const isLarge = (cur.size ?? 0) > largeBytes;

      let priority: AgentPriority = "MEDIUM";
      let score = 6;
      let reasonExtra = "";

      if (isHighPath || isRecent) {
        priority = "HIGH";
        score = 10;
      } else if (prevHadError) {
        priority = "MEDIUM";
        score = 7;
        reasonExtra = " (retry após erro anterior)";
      } else if (isLarge) {
        // Conservador: arquivos grandes sem urgência → LOW
        priority = "LOW";
        score = 3;
        reasonExtra = " (arquivo grande, deferido)";
      }

      decisions.push({
        file_id: cur.file_id,
        classification: "MODIFIED",
        action: "REPROCESS",
        priority,
        priority_score: score,
        reason: `Arquivo modificado desde último processamento${reasonExtra}`,
        next_version: (prev.version ?? 1) + 1,
      });
      continue;
    }

    if (neverProcessed) {
      decisions.push({
        file_id: cur.file_id,
        classification: "MODIFIED",
        action: "REPROCESS",
        priority: "MEDIUM",
        priority_score: 6,
        reason: "Rastreado mas nunca processado",
        next_version: prev.version ?? 1,
      });
      continue;
    }

    decisions.push({
      file_id: cur.file_id,
      classification: "UNCHANGED",
      action: "IGNORE",
      priority: "LOW",
      priority_score: 0,
      reason: "Sem alterações desde último processamento",
      next_version: prev.version ?? 1,
    });
  }

  // 2. Detect DELETED — present before, absent now
  for (const prev of input.previous_state) {
    if (curById.has(prev.file_id)) continue;
    if (prev.status === "inactive") continue; // already archived
    decisions.push({
      file_id: prev.file_id,
      classification: "DELETED",
      action: "ARCHIVE",
      priority: "LOW",
      priority_score: 1,
      reason: "Arquivo presente em scan anterior, ausente no scan atual",
      next_version: prev.version ?? 1,
    });
  }

  const summary = decisions.reduce(
    (acc, d) => {
      acc.total++;
      if (d.classification === "NEW") acc.new++;
      else if (d.classification === "MODIFIED") acc.modified++;
      else if (d.classification === "UNCHANGED") acc.unchanged++;
      else if (d.classification === "DELETED") acc.deleted++;
      if (d.action !== "IGNORE") acc.queued++;
      return acc;
    },
    { total: 0, new: 0, modified: 0, unchanged: 0, deleted: 0, queued: 0 },
  );

  return { processing_queue: decisions, summary };
}

/**
 * Maps an agent decision to the numeric priority used by processing_queue
 * (higher = more urgent, matches claim_processing_jobs ordering).
 */
export function decisionToQueuePriority(d: AgentDecision): number {
  return d.priority_score;
}
