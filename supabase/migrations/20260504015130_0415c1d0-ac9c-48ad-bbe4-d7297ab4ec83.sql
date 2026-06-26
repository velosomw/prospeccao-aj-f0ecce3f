
-- Boost de prioridade automático para falhas únicas/transitórias
-- Quando um job falha mas ainda tem retries, aumenta priority para acelerar consolidação

CREATE OR REPLACE FUNCTION public.fail_processing_job(p_job_id uuid, p_error_message text, p_retry_after_ms integer DEFAULT NULL::integer, p_block_reason text DEFAULT 'error'::text)
 RETURNS processing_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       SET status = 'failed', error_message = p_error_message, block_reason = p_block_reason,
           lock_until = NULL, locked_by = NULL, updated_at = now()
     WHERE id = p_job_id
     RETURNING * INTO result;
    RETURN result;
  END IF;

  -- Calcula delay (rate-limit usa Retry-After; demais usam backoff curto p/ falhas únicas)
  IF p_retry_after_ms IS NOT NULL AND p_retry_after_ms > 0 THEN
    delay_seconds := GREATEST(30, CEIL(p_retry_after_ms / 1000.0)::integer);
  ELSE
    -- Backoff acelerado: 15s, 60s, 5min, 30min
    delay_seconds := CASE job.attempts
      WHEN 1 THEN 15
      WHEN 2 THEN 60
      WHEN 3 THEN 300
      ELSE 1800
    END;
  END IF;

  -- BOOST: falha única transitória (não rate-limit) → aumenta prioridade para consolidar mais rápido
  -- Cap em 9 (mantém 10 reservado para reprocessos manuais do gestor)
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
$function$;

-- Helper: reenfileira manualmente itens com falha única (attempts <= 2) ainda dentro de max_attempts,
-- elevando prioridade. Chamável pelo gestor para acelerar consolidação.
CREATE OR REPLACE FUNCTION public.boost_recurring_single_failures(p_min_priority integer DEFAULT 8)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected integer := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor_ia'::app_role)
       OR public.has_role(auth.uid(), 'coordenador'::app_role)) THEN
    -- também permite chamada via service_role (auth.uid() = NULL)
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Permissão negada';
    END IF;
  END IF;

  WITH boosted AS (
    UPDATE public.processing_queue
       SET priority = GREATEST(priority, p_min_priority),
           next_attempt_at = LEAST(next_attempt_at, now() + interval '15 seconds'),
           block_reason = NULL,
           updated_at = now()
     WHERE status = 'pending'
       AND attempts BETWEEN 1 AND 2
       AND attempts < max_attempts
       AND COALESCE(block_reason,'') <> 'rate_limit'
    RETURNING 1
  )
  SELECT COUNT(*) INTO affected FROM boosted;
  RETURN affected;
END;
$function$;
