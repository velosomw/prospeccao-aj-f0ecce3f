
-- ============================================================
-- FASE 1: Backoff + Lock TTL + Worker atômico
-- ============================================================

-- 1) Novas colunas na fila
ALTER TABLE public.processing_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS block_reason text,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_pq_ready
  ON public.processing_queue (next_attempt_at, priority DESC, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pq_locked
  ON public.processing_queue (lock_until)
  WHERE status = 'processing';

-- 2) Configuração global do worker
CREATE TABLE IF NOT EXISTS public.worker_config (
  id text PRIMARY KEY DEFAULT 'default',
  batch_size integer NOT NULL DEFAULT 5,
  lock_ttl_minutes integer NOT NULL DEFAULT 5,
  cron_interval_seconds integer NOT NULL DEFAULT 30,
  max_attempts integer NOT NULL DEFAULT 5,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.worker_config (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.worker_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem worker_config"
  ON public.worker_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestor IA gerencia worker_config"
  ON public.worker_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role));

-- 3) Claim atômico de jobs (worker pega N jobs de uma vez sem race)
CREATE OR REPLACE FUNCTION public.claim_processing_jobs(
  p_worker_id text,
  p_batch_size integer DEFAULT 5,
  p_lock_minutes integer DEFAULT 5
) RETURNS SETOF public.processing_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Libera locks expirados antes de buscar
  UPDATE public.processing_queue
     SET status = 'pending',
         lock_until = NULL,
         locked_by = NULL,
         block_reason = COALESCE(block_reason,'') || ' [auto-released: lock expirado]'
   WHERE status = 'processing'
     AND lock_until IS NOT NULL
     AND lock_until < now();

  -- Pega próximos N jobs prontos (atômico via FOR UPDATE SKIP LOCKED)
  RETURN QUERY
  WITH picked AS (
    SELECT id
      FROM public.processing_queue
     WHERE status = 'pending'
       AND next_attempt_at <= now()
       AND attempts < max_attempts
     ORDER BY priority DESC, next_attempt_at ASC, created_at ASC
     LIMIT p_batch_size
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.processing_queue pq
     SET status      = 'processing',
         lock_until  = now() + make_interval(mins => p_lock_minutes),
         locked_by   = p_worker_id,
         attempts    = pq.attempts + 1,
         updated_at  = now()
   WHERE pq.id IN (SELECT id FROM picked)
   RETURNING pq.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_processing_jobs(text, integer, integer)
  TO authenticated, service_role;

-- 4) Marca job como erro e calcula próximo retry com backoff exponencial
CREATE OR REPLACE FUNCTION public.fail_processing_job(
  p_job_id uuid,
  p_error_message text,
  p_retry_after_ms integer DEFAULT NULL,
  p_block_reason text DEFAULT 'error'
) RETURNS public.processing_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job public.processing_queue;
  delay_seconds integer;
  result public.processing_queue;
BEGIN
  SELECT * INTO job FROM public.processing_queue WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % não encontrado', p_job_id;
  END IF;

  -- Esgotou tentativas → arquiva como failed_job
  IF job.attempts >= job.max_attempts THEN
    INSERT INTO public.failed_jobs (
      original_queue_id, file_id, company_id, rma_id, ano, mes,
      reason, attempts, error_message, payload
    ) VALUES (
      job.id, job.file_id, job.company_id, job.rma_id, job.ano, job.mes,
      p_block_reason, job.attempts, p_error_message, COALESCE(job.payload,'{}'::jsonb)
    );

    UPDATE public.processing_queue
       SET status = 'failed',
           error_message = p_error_message,
           block_reason = p_block_reason,
           lock_until = NULL,
           locked_by = NULL,
           updated_at = now()
     WHERE id = p_job_id
     RETURNING * INTO result;
    RETURN result;
  END IF;

  -- Calcula delay: usa Retry-After se vier, senão backoff exponencial
  IF p_retry_after_ms IS NOT NULL AND p_retry_after_ms > 0 THEN
    delay_seconds := GREATEST(30, CEIL(p_retry_after_ms / 1000.0)::integer);
  ELSE
    -- 30s, 2min, 10min, 1h, 6h
    delay_seconds := CASE job.attempts
      WHEN 1 THEN 30
      WHEN 2 THEN 120
      WHEN 3 THEN 600
      WHEN 4 THEN 3600
      ELSE 21600
    END;
  END IF;

  UPDATE public.processing_queue
     SET status = 'pending',
         next_attempt_at = now() + make_interval(secs => delay_seconds),
         lock_until = NULL,
         locked_by = NULL,
         error_message = p_error_message,
         block_reason = p_block_reason,
         updated_at = now()
   WHERE id = p_job_id
   RETURNING * INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fail_processing_job(uuid, text, integer, text)
  TO authenticated, service_role;

-- 5) Marca job como concluído
CREATE OR REPLACE FUNCTION public.complete_processing_job(
  p_job_id uuid,
  p_payload jsonb DEFAULT NULL
) RETURNS public.processing_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.processing_queue;
BEGIN
  UPDATE public.processing_queue
     SET status = 'done',
         lock_until = NULL,
         locked_by = NULL,
         error_message = NULL,
         block_reason = NULL,
         payload = COALESCE(p_payload, payload),
         updated_at = now()
   WHERE id = p_job_id
   RETURNING * INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_processing_job(uuid, jsonb)
  TO authenticated, service_role;

-- 6) Aplica max_attempts padrão a jobs antigos
UPDATE public.processing_queue
   SET max_attempts = 5
 WHERE max_attempts IS NULL OR max_attempts = 0;
