// Pure helpers for merging RMA analysis snapshots and computing the
// non-regressive percentual. Extracted from rma-analyze to be unit-testable.

export interface TopicSnapshot {
  number: number;
  name: string;
  status: "pendente" | "incompleto" | "completo";
  completude: number;
  fileCount: number;
  docsParsed: number;
  errors: string[];
  processing?: boolean;
}

export interface ExpectedTopic { number: number; name: string }

export function emptyTopic(e: ExpectedTopic, processing = false): TopicSnapshot {
  return {
    number: e.number,
    name: e.name,
    status: "pendente",
    completude: 0,
    fileCount: 0,
    docsParsed: 0,
    errors: [],
    processing,
  };
}

export function buildPrevTopicMap(prevTopics: any[] | null | undefined): Map<string, TopicSnapshot> {
  const m = new Map<string, TopicSnapshot>();
  if (!Array.isArray(prevTopics)) return m;
  for (const t of prevTopics) {
    if (!t || typeof t !== "object" || !t.name) continue;
    m.set(String(t.name).toLowerCase(), { ...(t as TopicSnapshot), processing: false });
  }
  return m;
}

/**
 * Merge live results from the current run with the previous snapshot baseline.
 * Guarantees:
 *  - Topics not yet reprocessed in this run keep their previous snapshot
 *    (never regress to "pendente").
 *  - Topics processed in the current run override the baseline.
 *  - Output length and order match `expectedTopics`.
 */
export function mergeTopics(
  expectedTopics: ExpectedTopic[],
  liveResults: TopicSnapshot[],
  prevByName: Map<string, TopicSnapshot>,
  currentName: string | null = null,
): TopicSnapshot[] {
  return expectedTopics.map((e) => {
    const live = liveResults.find((p) => p.name.toLowerCase() === e.name.toLowerCase());
    if (live) return { ...live, processing: false };
    const isCurrent =
      currentName !== null && e.name.toLowerCase() === currentName.toLowerCase();
    const prev = prevByName.get(e.name.toLowerCase());
    if (prev) return { ...prev, number: e.number, name: e.name, processing: isCurrent };
    return emptyTopic(e, isCurrent);
  });
}

/**
 * Non-regressive percentual: never lower than the previous baseline.
 * Live percentual = average of completude across topics.
 */
export function computePercentual(topics: TopicSnapshot[], baselinePercent = 0): number {
  const safeBaseline = Math.max(0, Math.min(100, Number(baselinePercent) || 0));
  if (!topics || topics.length === 0) return safeBaseline;
  const live = Math.round(
    topics.reduce((s, t) => s + (Number(t.completude) || 0), 0) / topics.length,
  );
  return Math.max(0, Math.min(100, Math.max(safeBaseline, live)));
}
