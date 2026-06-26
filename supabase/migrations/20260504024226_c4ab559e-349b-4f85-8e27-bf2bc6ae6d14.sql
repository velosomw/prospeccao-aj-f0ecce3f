-- 1) Coluna para contar falhas de parse no rma-analyze
ALTER TABLE public.onedrive_files
  ADD COLUMN IF NOT EXISTS parse_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_parse_error_at timestamptz;

-- 2) Helper: marca arquivo como "manual upload exigido" e cancela fila
CREATE OR REPLACE FUNCTION public.mark_file_manual_upload_required(
  p_file_id text,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.onedrive_files
     SET requires_manual_upload = true,
         status = 'manual_upload_required',
         last_learning_error = COALESCE(p_reason, last_learning_error),
         updated_at = now()
   WHERE file_id = p_file_id;

  UPDATE public.processing_queue
     SET status = 'cancelled',
         block_reason = 'manual_upload_required',
         lock_until = NULL,
         locked_by = NULL,
         error_message = COALESCE(p_reason, error_message),
         updated_at = now()
   WHERE file_id = p_file_id
     AND status IN ('pending','processing','failed');
END;
$$;

-- 3) Substitui fail_processing_job: 2ª falha → manual_upload_required (não rate_limit)
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
  boosted_priority integer;
BEGIN
  SELECT * INTO job FROM public.processing_queue WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % não encontrado', p_job_id;
  END IF;

  -- 2ª falha consecutiva e NÃO é rate-limit → tira da fila e exige upload manual
  IF p_block_reason <> 'rate_limit' AND job.attempts >= 2 THEN
    INSERT INTO public.failed_jobs (
      original_queue_id, file_id, company_id, rma_id, ano, mes,
      reason, attempts, error_message, payload
    ) VALUES (
      job.id, job.file_id, job.company_id, job.rma_id, job.ano, job.mes,
      'manual_upload_required', job.attempts, p_error_message, COALESCE(job.payload,'{}'::jsonb)
    );

    UPDATE public.processing_queue
       SET status = 'cancelled',
           block_reason = 'manual_upload_required',
           error_message = p_error_message,
           lock_until = NULL,
           locked_by = NULL,
           updated_at = now()
     WHERE id = p_job_id
     RETURNING * INTO result;

    PERFORM public.mark_file_manual_upload_required(job.file_id, p_error_message);
    RETURN result;
  END IF;

  -- Esgotou tentativas (caso clássico: rate-limit que estourou max_attempts)
  IF job.attempts >= job.max_attempts THEN
    INSERT INTO public.failed_jobs (
      original_queue_id, file_id, company_id, rma_id, ano, mes,
      reason, attempts, error_message, payload
    ) VALUES (
      job.id, job.file_id, job.company_id, job.rma_id, job.ano, job.mes,
      p_block_reason, job.attempts, p_error_message, COALESCE(job.payload,'{}'::jsonb)
    );

    UPDATE public.processing_queue
       SET status = 'failed', error_message = p_error_message, block_reason = p_block_reason,
           lock_until = NULL, locked_by = NULL, updated_at = now()
     WHERE id = p_job_id
     RETURNING * INTO result;

    PERFORM public.mark_file_manual_upload_required(job.file_id, p_error_message);
    RETURN result;
  END IF;

  -- 1ª falha (ou rate-limit) → reagenda com backoff curto
  IF p_retry_after_ms IS NOT NULL AND p_retry_after_ms > 0 THEN
    delay_seconds := GREATEST(30, CEIL(p_retry_after_ms / 1000.0)::integer);
  ELSE
    delay_seconds := CASE job.attempts
      WHEN 1 THEN 15
      WHEN 2 THEN 60
      WHEN 3 THEN 300
      ELSE 1800
    END;
  END IF;

  IF p_block_reason <> 'rate_limit' AND job.attempts < job.max_attempts THEN
    boosted_priority := LEAST(9, COALESCE(job.priority, 5) + 2);
  ELSE
    boosted_priority := job.priority;
  END IF;

  UPDATE public.processing_queue
     SET status = 'pending',
         next_attempt_at = now() + make_interval(secs => delay_seconds),
         priority = boosted_priority,
         lock_until = NULL, locked_by = NULL,
         error_message = p_error_message,
         block_reason = p_block_reason,
         updated_at = now()
   WHERE id = p_job_id
   RETURNING * INTO result;
  RETURN result;
END;
$$;