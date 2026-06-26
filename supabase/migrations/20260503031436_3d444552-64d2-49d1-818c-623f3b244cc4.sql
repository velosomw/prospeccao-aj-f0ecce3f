DROP FUNCTION IF EXISTS public.auto_retry_failed_rma_runs(text, text, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.auto_retry_failed_rma_runs(
  p_function_url text,
  p_anon_key text,
  p_max_retries integer DEFAULT 3,
  p_cooldown_minutes integer DEFAULT 3,
  p_batch_limit integer DEFAULT 5
)
RETURNS TABLE(out_company_id uuid, out_retry_attempt integer, out_request_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
  req_id bigint;
BEGIN
  FOR r IN
    SELECT ar.id AS aid, ar.company_id AS cid, COALESCE(ar.auto_retry_count, 0) AS tries
      FROM public.rma_analysis_results ar
     WHERE ar.status = 'erro'
       AND COALESCE(ar.auto_retry_count, 0) < p_max_retries
       AND (ar.last_auto_retry_at IS NULL
            OR ar.last_auto_retry_at < now() - make_interval(mins => p_cooldown_minutes))
       AND (ar.finished_at IS NULL OR ar.finished_at < now() - make_interval(mins => p_cooldown_minutes))
     ORDER BY ar.updated_at ASC
     LIMIT p_batch_limit
  LOOP
    UPDATE public.rma_analysis_results
       SET auto_retry_count = COALESCE(auto_retry_count, 0) + 1,
           last_auto_retry_at = now(),
           updated_at = now(),
           log = COALESCE(log, '[]'::jsonb) || jsonb_build_array(
             format('[%s] [auto-retry #%s] disparando nova execução da pipeline',
                    to_char(now(),'YYYY-MM-DD HH24:MI:SS'), r.tries + 1)
           )
     WHERE id = r.aid;

    SELECT net.http_post(
      url := p_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || p_anon_key,
        'apikey', p_anon_key
      ),
      body := jsonb_build_object(
        'companyId', r.cid::text,
        'auto_retry', true,
        'attempt', r.tries + 1
      )
    ) INTO req_id;

    out_company_id := r.cid;
    out_retry_attempt := r.tries + 1;
    out_request_id := req_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_retry_failed_rma_runs(text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_retry_failed_rma_runs(text, text, integer, integer, integer) TO postgres, service_role;