-- Adiciona trava de concorrência (lock distribuído com TTL) para rma-analyze
ALTER TABLE public.rma_analysis_results
  ADD COLUMN IF NOT EXISTS lock_token uuid,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS lock_acquired_at timestamptz;

-- Tenta adquirir lock atômico para uma company_id.
-- Retorna { acquired, token, locked_until, holder, current_status, reason }
CREATE OR REPLACE FUNCTION public.acquire_rma_analysis_lock(
  p_company_id uuid,
  p_holder text DEFAULT 'rma-analyze',
  p_ttl_minutes integer DEFAULT 8,
  p_force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.rma_analysis_results%ROWTYPE;
  new_token uuid := gen_random_uuid();
  new_until timestamptz := now() + make_interval(mins => GREATEST(1, p_ttl_minutes));
  can_take boolean := false;
  reason text := 'acquired';
BEGIN
  -- Lock pessimista da linha (ou criação se não existir)
  SELECT * INTO r FROM public.rma_analysis_results
   WHERE company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rma_analysis_results (
      company_id, status, percentual, topics, log,
      lock_token, locked_until, locked_by, lock_acquired_at,
      started_at, updated_at
    ) VALUES (
      p_company_id, 'em_analise', 0, '[]'::jsonb,
      jsonb_build_array(format('[%s] [lock] adquirido por %s (novo registro)',
        to_char(now(),'YYYY-MM-DD HH24:MI:SS'), p_holder)),
      new_token, new_until, p_holder, now(),
      now(), now()
    );
    RETURN jsonb_build_object(
      'acquired', true, 'token', new_token,
      'locked_until', new_until, 'reason', 'created'
    );
  END IF;

  -- Decide se pode tomar o lock
  IF p_force THEN
    can_take := true; reason := 'forced';
  ELSIF r.lock_token IS NULL OR r.locked_until IS NULL THEN
    can_take := true; reason := 'no_lock';
  ELSIF r.locked_until < now() THEN
    can_take := true; reason := 'expired';
  ELSIF r.status NOT IN ('em_analise') THEN
    can_take := true; reason := 'status_idle';
  ELSE
    can_take := false; reason := 'busy';
  END IF;

  IF NOT can_take THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'token', NULL,
      'locked_until', r.locked_until,
      'holder', r.locked_by,
      'current_status', r.status,
      'reason', reason
    );
  END IF;

  UPDATE public.rma_analysis_results
     SET lock_token = new_token,
         locked_until = new_until,
         locked_by = p_holder,
         lock_acquired_at = now(),
         updated_at = now(),
         log = COALESCE(log,'[]'::jsonb) || jsonb_build_array(
           format('[%s] [lock] adquirido por %s (motivo=%s)',
             to_char(now(),'YYYY-MM-DD HH24:MI:SS'), p_holder, reason)
         )
   WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'acquired', true,
    'token', new_token,
    'locked_until', new_until,
    'reason', reason
  );
END;
$$;

-- Estende TTL do lock se o token bater (heartbeat).
CREATE OR REPLACE FUNCTION public.extend_rma_analysis_lock(
  p_company_id uuid,
  p_token uuid,
  p_ttl_minutes integer DEFAULT 8
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected int;
BEGIN
  UPDATE public.rma_analysis_results
     SET locked_until = now() + make_interval(mins => GREATEST(1, p_ttl_minutes)),
         updated_at = now()
   WHERE company_id = p_company_id
     AND lock_token = p_token
     AND status = 'em_analise';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

-- Libera o lock (apenas se token bater)
CREATE OR REPLACE FUNCTION public.release_rma_analysis_lock(
  p_company_id uuid,
  p_token uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected int;
BEGIN
  UPDATE public.rma_analysis_results
     SET lock_token = NULL,
         locked_until = NULL,
         locked_by = NULL,
         updated_at = now(),
         log = COALESCE(log,'[]'::jsonb) || jsonb_build_array(
           format('[%s] [lock] liberado', to_char(now(),'YYYY-MM-DD HH24:MI:SS'))
         )
   WHERE company_id = p_company_id
     AND lock_token = p_token;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

-- Atualiza o sanitizer para também liberar locks de runs travadas
CREATE OR REPLACE FUNCTION public.sanitize_stuck_rma_runs(p_max_minutes integer DEFAULT 10)
RETURNS TABLE(runs_reset integer, files_released integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_runs integer := 0;
  v_files integer := 0;
  cutoff timestamptz := now() - make_interval(mins => p_max_minutes);
BEGIN
  WITH stuck AS (
    SELECT id, updated_at, topics
      FROM public.rma_analysis_results
     WHERE status = 'em_analise'
       AND updated_at < cutoff
  ),
  upd AS (
    UPDATE public.rma_analysis_results r
       SET status = 'erro',
           error_message = format(
             '[auto-sanitize] Run travada sem atualização há %s min — marcada como erro automaticamente.',
             EXTRACT(EPOCH FROM (now() - s.updated_at))::int / 60
           ),
           finished_at = now(),
           updated_at = now(),
           lock_token = NULL,
           locked_until = NULL,
           locked_by = NULL,
           topics = (
             SELECT COALESCE(jsonb_agg(jsonb_set(t, '{processing}', 'false'::jsonb)), '[]'::jsonb)
               FROM jsonb_array_elements(COALESCE(s.topics, '[]'::jsonb)) t
           )
      FROM stuck s
     WHERE r.id = s.id
    RETURNING r.id
  )
  SELECT COUNT(*) INTO v_runs FROM upd;

  WITH rel AS (
    UPDATE public.onedrive_files
       SET status = 'tracked',
           error_message = '[auto-sanitize] processing órfão liberado',
           updated_at = now()
     WHERE status = 'processing'
       AND updated_at < cutoff
    RETURNING file_id
  )
  SELECT COUNT(*) INTO v_files FROM rel;

  RETURN QUERY SELECT v_runs, v_files;
END;
$$;