
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
      JOIN public.pipeline_documents pd ON pd.external_id = f.file_id
      JOIN public.ai_extractions e ON e.document_id = pd.id
     WHERE f.status IN ('queued','pending','error','tracked','new','updated')
       AND COALESCE(e.quality_score, e.ai_confidence, 0) >= p_min_quality
       AND e.status IN ('completed','validated','approved')
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
