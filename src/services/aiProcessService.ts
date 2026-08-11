// Engine de Agentes — wrapper para invocar /functions/v1/ai-process
// Suporta:
//   - processDocument(input)            → síncrono (curto) OU 202 com pollUrl (longo)
//   - startAsyncProcessing(input)       → força modo assíncrono (retorna { id, pollUrl })
//   - getProcessingStatus(id)           → snapshot de status/progresso
//   - waitForProcessing(id, onProgress) → polling até completed/failed
import { supabase } from "@/lib/supabase-any";

export type AgentClasse = "PIX" | "COMPROVANTE" | "BOLETO" | "BALANCETE" | "DRE" | "OUTRO";
export type AiStatus = "pending" | "processing" | "completed" | "failed" | "canceled";

export interface AiProcessInput {
  document_id?: string;
  prospeccao_id?: string;
  text: string;
  normalized_text?: string;
  path?: string;
  ocr_confidence?: number;
  async?: boolean;
  /** ID de um job anterior canceled/failed para reaproveitar partial_results */
  resume_from_id?: string;
}

export interface AiProcessSyncResult {
  id?: string;
  status: "completed";
  progress: 100;
  classe: AgentClasse;
  agent: string;
  data: Record<string, unknown>;
  classification: { classe: AgentClasse; confianca: number; motivo: string };
  validation: { valido: boolean; correcoes: unknown[]; confianca: number };
  validado: boolean;
  ocr_conf: number;
  ai_conf: number;
  final_conf: number;
}

export interface AiProcessAsyncStarted {
  id: string;
  status: "pending";
  progress: 0;
  chunks_total: number;
  pollUrl: string;
  message: string;
}

export interface AiProcessStatus {
  id: string;
  status: AiStatus;
  progress: number;
  chunks_processed?: number | null;
  chunks_total?: number | null;
  classe?: AgentClasse | null;
  agent?: string | null;
  ocr_conf?: number | null;
  ai_conf?: number | null;
  final_conf?: number | null;
  extracted_data?: Record<string, unknown> | null;
  validation?: { valido: boolean; correcoes: unknown[]; confianca: number } | null;
  valid?: boolean | null;
  corrections?: unknown[] | null;
  partial_results?: unknown[] | null;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at?: string;
  updated_at?: string;
}

function isAsyncStarted(r: unknown): r is AiProcessAsyncStarted {
  return !!r && typeof r === "object" && (r as { status?: string }).status === "pending";
}

/** Inicia processamento. Retorna resultado síncrono ou job assíncrono iniciado. */
export async function processDocument(
  input: AiProcessInput,
): Promise<AiProcessSyncResult | AiProcessAsyncStarted> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const text = await resp.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || `Resposta inválida do processamento IA (${resp.status})` };
  }
  if (!resp.ok) {
    const message = (data as { error?: string; message?: string })?.error ||
      (data as { error?: string; message?: string })?.message ||
      `Falha no processamento IA (${resp.status})`;
    throw new Error(message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as AiProcessSyncResult | AiProcessAsyncStarted;
}

/** Força modo assíncrono em lote. */
export async function startAsyncProcessing(
  input: Omit<AiProcessInput, "async">,
): Promise<AiProcessAsyncStarted> {
  const r = await processDocument({ ...input, async: true });
  if (!isAsyncStarted(r)) {
    throw new Error("Esperava resposta assíncrona");
  }
  return r;
}

const TERMINAL_STATUSES: AiStatus[] = ["completed", "failed", "canceled"];

function isTerminal(status: AiStatus | undefined): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Consulta status/progresso de um job com retry exponencial em erros transitórios
 * (rede, 5xx, 429). Erros 4xx (exceto 429) falham imediatamente.
 */
export async function getProcessingStatus(
  id: string,
  opts: { retries?: number; baseDelayMs?: number; signal?: AbortSignal } = {},
): Promise<AiProcessStatus> {
  if (!id) throw new Error("id é obrigatório para consultar status");
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-process?id=${encodeURIComponent(id)}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        signal: opts.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      // Erro de cliente não-recuperável → falha imediata
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
        const body = await resp.text().catch(() => "");
        throw new Error(`Falha ao consultar status (${resp.status}): ${body || resp.statusText}`);
      }
      // Transitório → tenta novamente
      if (!resp.ok) {
        throw new Error(`Status ${resp.status}`);
      }
      return (await resp.json()) as AiProcessStatus;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      lastErr = err;
      if (attempt === retries) break;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200;
      await sleep(delay, opts.signal);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Falha ao consultar status");
}

/**
 * Polling unificado: consulta status repetidamente com backoff até estado
 * terminal (completed/failed/canceled), timeout ou abort. Usa
 * `getProcessingStatus` (que já possui retry) e para automaticamente.
 */
export async function waitForProcessing(
  id: string,
  onProgress?: (s: AiProcessStatus) => void,
  opts: {
    intervalMs?: number;
    timeoutMs?: number;
    maxIntervalMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<AiProcessStatus> {
  if (!id) throw new Error("id é obrigatório para waitForProcessing");
  const baseInterval = opts.intervalMs ?? 2000;
  const maxInterval = opts.maxIntervalMs ?? 10_000;
  const timeout = opts.timeoutMs ?? 10 * 60 * 1000;
  const start = Date.now();

  let interval = baseInterval;
  let consecutiveErrors = 0;

  while (true) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const s = await getProcessingStatus(id, { signal: opts.signal });
      consecutiveErrors = 0;
      onProgress?.(s);
      if (isTerminal(s.status)) return s;
      // Reset interval enquanto progride normalmente
      interval = baseInterval;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") throw err;
      consecutiveErrors++;
      if (consecutiveErrors >= 5) throw err;
      // Backoff exponencial em falhas consecutivas
      interval = Math.min(maxInterval, baseInterval * Math.pow(2, consecutiveErrors));
    }
    if (Date.now() - start > timeout) throw new Error("Timeout aguardando processamento");
    await sleep(interval, opts.signal);
  }
}

export interface CancelResult {
  id: string;
  status: AiStatus;
  canceled: boolean;
  message: string;
}

/**
 * Cancela um processamento assíncrono em andamento.
 * Marca status=canceled; o worker interrompe cooperativamente entre chunks.
 * Retorna 409 se o job já estiver em estado terminal.
 */
export async function cancelProcessing(id: string): Promise<CancelResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-process?id=${encodeURIComponent(id)}`;
  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
  const json = (await resp.json()) as CancelResult & { error?: string };
  if (!resp.ok && resp.status !== 409) {
    throw new Error(json.error || `Falha ao cancelar: ${resp.status}`);
  }
  return json;
}

/**
 * Retentativa de um job assíncrono cancelado/failed.
 * Busca o job anterior, cria um NOVO job assíncrono com o mesmo document_id
 * e passa `resume_from_id` para reaproveitar os `partial_results` já calculados.
 */
export async function retryProcessing(previousJobId: string): Promise<AiProcessAsyncStarted> {
  const { data: prev, error } = await supabase
    .from("ai_extractions")
    .select("*")
    .eq("id", previousJobId)
    .maybeSingle();
  if (error) throw error;
  if (!prev) throw new Error("Job anterior não encontrado");
  if (prev.status !== "canceled" && prev.status !== "failed") {
    throw new Error(`Só é possível reprocessar jobs canceled/failed (status atual: ${prev.status})`);
  }
  if (!prev.raw_text) throw new Error("Job anterior não possui raw_text para retentativa");

  return await startAsyncProcessing({
    document_id: prev.document_id ?? undefined,
    prospeccao_id: prev.prospeccao_id ?? undefined,
    text: prev.raw_text,
    normalized_text: prev.normalized_text ?? undefined,
    path: prev.path ?? undefined,
    ocr_confidence: prev.ocr_confidence ?? undefined,
    resume_from_id: previousJobId,
  });
}

export async function listExtractionsByRma(prospeccaoId: string) {
  const { data, error } = await supabase
    .from("ai_extractions")
    .select("*")
    .eq("prospeccao_id", prospeccaoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
