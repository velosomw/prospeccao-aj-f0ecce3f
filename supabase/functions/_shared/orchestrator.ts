// Multi-Agent Orchestrator — RMA
// ------------------------------------------------------------
// Decision Engine that consumes the Incremental Agent output
// (or a raw current_scan) and produces a routed task plan:
//   tasks[].route = ["INGESTION","OCR","LLM","CONSOLIDATION","VALIDATION"]
//
// Deterministic. Does NOT execute work — it only decides and routes.
// Workers are separate edge functions / queue consumers.

import { reconcile, type AgentDecision } from "./incremental-agent.ts";

export type WorkerKey = "INGESTION" | "OCR" | "LLM" | "CONSOLIDATION" | "VALIDATION";

export interface OrchestratorTask {
  file_id: string;
  action: "PROCESS" | "REPROCESS" | "IGNORE" | "ARCHIVE";
  priority: "HIGH" | "MEDIUM" | "LOW";
  priority_score: number;
  route: WorkerKey[];
  reason: string;
  classification: AgentDecision["classification"];
  document_type_hint?: string;
}

export interface OrchestratorPlan {
  tasks: OrchestratorTask[];
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
    by_route: Record<string, number>;
  };
}

const FINANCIAL_HINTS = ["balancete", "balanco", "dre", "dfc", "razao", "razão", "fluxo", "demonstrativo"];
const STRUCTURED_EXT = [".xlsx", ".xls", ".csv", ".ods"];
const UNSTRUCTURED_EXT = [".pdf", ".png", ".jpg", ".jpeg", ".tiff"];

function pickRoute(file: { path?: string; file_name?: string; mime_type?: string | null }): {
  route: WorkerKey[];
  hint?: string;
} {
  const lowerPath = (file.path || "").toLowerCase();
  const lowerName = (file.file_name || "").toLowerCase();
  const ext = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".")) : "";

  const isFinancial = FINANCIAL_HINTS.some((h) => lowerPath.includes(h) || lowerName.includes(h));
  const isStructured = STRUCTURED_EXT.includes(ext);
  const isUnstructured = UNSTRUCTURED_EXT.includes(ext);

  if (isFinancial) {
    // Full pipeline
    return {
      route: ["INGESTION", "OCR", "LLM", "CONSOLIDATION", "VALIDATION"],
      hint: FINANCIAL_HINTS.find((h) => lowerPath.includes(h) || lowerName.includes(h)),
    };
  }
  if (isStructured) {
    // Structured but not financial → skip OCR
    return { route: ["INGESTION", "LLM", "VALIDATION"] };
  }
  if (isUnstructured) {
    // Unknown unstructured → OCR + classify only
    return { route: ["INGESTION", "OCR", "VALIDATION"] };
  }
  // Unknown / invalid → validation only
  return { route: ["INGESTION", "VALIDATION"] };
}

/**
 * Build orchestration plan from current_scan + previous_state via incremental agent.
 */
export function orchestrate(input: {
  current_scan: any[];
  previous_state?: any[];
  context?: Parameters<typeof reconcile>[0]["context"];
}): OrchestratorPlan {
  const reconciled = reconcile({
    current_scan: input.current_scan,
    previous_state: input.previous_state ?? [],
    context: input.context,
  });

  const tasks: OrchestratorTask[] = reconciled.processing_queue.map((d) => {
    const cur = input.current_scan.find((c) => c.file_id === d.file_id) ?? {};
    let route: WorkerKey[];
    let hint: string | undefined;

    if (d.action === "ARCHIVE") {
      route = ["VALIDATION"]; // mark inactive + verify nothing depends on it
    } else if (d.action === "IGNORE") {
      route = [];
    } else {
      const r = pickRoute(cur);
      route = r.route;
      hint = r.hint;
    }

    return {
      file_id: d.file_id,
      action: d.action,
      priority: d.priority,
      priority_score: d.priority_score,
      route,
      reason: d.reason,
      classification: d.classification,
      document_type_hint: hint,
    };
  });

  const by_route: Record<string, number> = {};
  for (const t of tasks) {
    if (t.route.length === 0) continue;
    const k = t.route.join(">");
    by_route[k] = (by_route[k] ?? 0) + 1;
  }

  return {
    tasks,
    summary: {
      total: tasks.length,
      high: tasks.filter((t) => t.priority === "HIGH").length,
      medium: tasks.filter((t) => t.priority === "MEDIUM").length,
      low: tasks.filter((t) => t.priority === "LOW").length,
      by_route,
    },
  };
}
