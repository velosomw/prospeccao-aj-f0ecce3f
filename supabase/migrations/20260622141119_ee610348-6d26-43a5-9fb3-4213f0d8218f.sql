
-- 1) worker_config: novo modo e last_run_at
ALTER TABLE public.worker_config
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'paused'
    CHECK (mode IN ('paused','on_demand','daily')),
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_run_summary jsonb;

UPDATE public.worker_config SET mode = 'paused' WHERE mode IS NULL OR mode = '';

-- 2) processing_queue: trigger_source (auto | manual)
ALTER TABLE public.processing_queue
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'auto'
    CHECK (trigger_source IN ('auto','manual'));

CREATE INDEX IF NOT EXISTS processing_queue_trigger_status_idx
  ON public.processing_queue (trigger_source, status);

-- 3) Cleanup de jobs presos/órfãos
CREATE OR REPLACE FUNCTION public.cleanup_stuck_jobs(p_stuck_minutes integer DEFAULT 120)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_queue_cancelled int := 0;
  v_files_released int := 0;
  v_failed_purged int := 0;
  cutoff timestamptz := now() - make_interval(mins => GREATEST(5, p_stuck_minutes));
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'gestor_ia'::app_role)
              OR public.has_role(auth.uid(), 'coordenador'::app_role)) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  WITH upd AS (
    UPDATE public.processing_queue
       SET status = 'cancelled',
           lock_until = NULL,
           locked_by = NULL,
           block_reason = COALESCE(block_reason,'') || ' [cleanup_stuck_jobs]',
           updated_at = now()
     WHERE status IN ('processing','pending')
       AND updated_at < cutoff
    RETURNING 1
  ) SELECT COUNT(*) INTO v_queue_cancelled FROM upd;

  WITH rel AS (
    UPDATE public.onedrive_files
       SET status = 'manual_upload_required',
           last_learning_error = COALESCE(last_learning_error,'') || ' [cleanup_stuck_jobs]',
           updated_at = now()
     WHERE status = 'processing'
       AND (last_processed_at IS NULL OR last_processed_at < cutoff)
    RETURNING 1
  ) SELECT COUNT(*) INTO v_files_released FROM rel;

  WITH del AS (
    DELETE FROM public.failed_jobs
     WHERE created_at < now() - interval '30 days'
       AND resolved_at IS NOT NULL
    RETURNING 1
  ) SELECT COUNT(*) INTO v_failed_purged FROM del;

  RETURN jsonb_build_object(
    'queue_cancelled', v_queue_cancelled,
    'files_released',  v_files_released,
    'failed_purged',   v_failed_purged,
    'cutoff_minutes',  p_stuck_minutes,
    'executed_at',     now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stuck_jobs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_jobs(integer) TO authenticated, service_role;

-- 4) Correlação dedupe: arquivos com extração válida
CREATE OR REPLACE FUNCTION public.correlate_processed_files(p_min_quality numeric DEFAULT 0.7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_files int := 0;
  v_queue int := 0;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'gestor_ia'::app_role)
              OR public.has_role(auth.uid(), 'coordenador'::app_role)) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  WITH eligible AS (
    SELECT DISTINCT f.file_id
      FROM public.onedrive_files f
      JOIN public.ai_extractions e ON e.file_id = f.file_id
     WHERE f.status IN ('queued','pending','error','tracked','new','updated')
       AND COALESCE(e.quality_score, e.confidence, 0) >= p_min_quality
       AND e.status IN ('completed','validated')
  ),
  upd AS (
    UPDATE public.onedrive_files f
       SET status = 'processed',
           last_processed_at = COALESCE(f.last_processed_at, now()),
           updated_at = now()
     WHERE f.file_id IN (SELECT file_id FROM eligible)
    RETURNING f.file_id
  ),
  delq AS (
    DELETE FROM public.processing_queue
     WHERE file_id IN (SELECT file_id FROM upd)
       AND status IN ('pending','processing')
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM upd), (SELECT COUNT(*) FROM delq) INTO v_files, v_queue;

  RETURN jsonb_build_object(
    'files_correlated', v_files,
    'queue_removed',    v_queue,
    'min_quality',      p_min_quality,
    'executed_at',      now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correlate_processed_files(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correlate_processed_files(numeric) TO authenticated, service_role;

-- 5) Helper para Gestor IA mudar o modo
CREATE OR REPLACE FUNCTION public.set_worker_mode(p_mode text)
RETURNS public.worker_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.worker_config;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gestor_ia'::app_role) THEN
    RAISE EXCEPTION 'Apenas Gestor IA pode alterar o modo do worker';
  END IF;
  IF p_mode NOT IN ('paused','on_demand','daily') THEN
    RAISE EXCEPTION 'Modo inválido: %', p_mode;
  END IF;

  UPDATE public.worker_config
     SET mode = p_mode,
         enabled = (p_mode <> 'paused'),
         updated_at = now()
   WHERE id = 'default'
   RETURNING * INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.set_worker_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_worker_mode(text) TO authenticated, service_role;
