-- Função: marca como 'erro' qualquer rma_analysis_results em em_analise sem update há > 10 min.
-- Também libera onedrive_files em "processing" órfãos para reprocesso.
CREATE OR REPLACE FUNCTION public.sanitize_stuck_rma_runs(p_max_minutes integer DEFAULT 10)
RETURNS TABLE(runs_reset integer, files_released integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
           topics = (
             SELECT COALESCE(jsonb_agg(jsonb_set(t, '{processing}', 'false'::jsonb)), '[]'::jsonb)
               FROM jsonb_array_elements(COALESCE(s.topics, '[]'::jsonb)) t
           )
      FROM stuck s
     WHERE r.id = s.id
    RETURNING r.id
  )
  SELECT COUNT(*) INTO v_runs FROM upd;

  -- Libera arquivos OneDrive marcados "processing" órfãos
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

-- Permite chamada via RPC autenticada (somente leitura/uso interno do cron)
REVOKE ALL ON FUNCTION public.sanitize_stuck_rma_runs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sanitize_stuck_rma_runs(integer) TO postgres, service_role;

-- Agenda execução a cada 5 minutos
SELECT cron.unschedule('sanitize-stuck-rma-runs') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sanitize-stuck-rma-runs'
);

SELECT cron.schedule(
  'sanitize-stuck-rma-runs',
  '*/5 * * * *',
  $cron$ SELECT public.sanitize_stuck_rma_runs(10); $cron$
);

-- Aplica imediatamente para destravar a DIPLOMATA e quaisquer outras
SELECT * FROM public.sanitize_stuck_rma_runs(10);