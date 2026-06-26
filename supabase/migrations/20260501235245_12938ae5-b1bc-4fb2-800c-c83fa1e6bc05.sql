CREATE OR REPLACE FUNCTION public.requeue_failed_job(
  p_failed_id uuid,
  p_reset_attempts boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  f public.failed_jobs%ROWTYPE;
  new_queue_id uuid;
  v_attempts integer;
BEGIN
  -- Apenas gestor_ia ou coordenador podem reprocessar
  IF NOT (public.has_role(auth.uid(), 'gestor_ia'::app_role)
          OR public.has_role(auth.uid(), 'coordenador'::app_role)) THEN
    RAISE EXCEPTION 'Permissão negada para reprocessar jobs falhados';
  END IF;

  SELECT * INTO f FROM public.failed_jobs WHERE id = p_failed_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'failed_job % não encontrado', p_failed_id;
  END IF;

  IF f.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'failed_job % já foi resolvido', p_failed_id;
  END IF;

  -- Evita enfileirar duplicado
  IF EXISTS (
    SELECT 1 FROM public.processing_queue
    WHERE file_id = f.file_id AND status IN ('pending', 'processing')
  ) THEN
    RAISE EXCEPTION 'Já existe um job pendente/em processamento para o arquivo %', f.file_id;
  END IF;

  v_attempts := CASE WHEN p_reset_attempts THEN 0 ELSE COALESCE(f.attempts, 0) END;

  INSERT INTO public.processing_queue (
    file_id, company_id, rma_id, ano, mes,
    reason, status, priority, attempts, payload
  ) VALUES (
    f.file_id, f.company_id, f.rma_id, f.ano, f.mes,
    COALESCE(f.reason, 'requeue'), 'pending', 5,
    v_attempts, COALESCE(f.payload, '{}'::jsonb)
  )
  RETURNING id INTO new_queue_id;

  UPDATE public.failed_jobs
     SET resolved_at = now(),
         resolved_by = auth.uid(),
         resolution_notes = COALESCE(resolution_notes, '') ||
           CASE WHEN p_reset_attempts THEN '[requeue: attempts=0] ' ELSE '[requeue: attempts kept] ' END
   WHERE id = p_failed_id;

  RETURN new_queue_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.requeue_failed_job(uuid, boolean) TO authenticated;