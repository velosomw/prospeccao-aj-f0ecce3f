-- 1) Colunas de controle de retry automático
ALTER TABLE public.rma_analysis_results
  ADD COLUMN IF NOT EXISTS auto_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_auto_retry_at timestamptz;

-- 2) Função: encontra runs em 'erro' elegíveis e dispara nova análise
CREATE OR REPLACE FUNCTION public.auto_retry_failed_rma_runs(
  p_function_url text,
  p_anon_key text,
  p_max_retries integer DEFAULT 3,
  p_cooldown_minutes integer DEFAULT 3,
  p_batch_limit integer DEFAULT 5
)
RETURNS TABLE(company_id uuid, retry_attempt integer, request_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
  req_id bigint;
BEGIN
  FOR r IN
    SELECT id, company_id AS cid, COALESCE(auto_retry_count, 0) AS tries
      FROM public.rma_analysis_results
     WHERE status = 'erro'
       AND COALESCE(auto_retry_count, 0) < p_max_retries
       AND (last_auto_retry_at IS NULL
            OR last_auto_retry_at < now() - make_interval(mins => p_cooldown_minutes))
       AND (finished_at IS NULL OR finished_at < now() - make_interval(mins => p_cooldown_minutes))
     ORDER BY updated_at ASC
     LIMIT p_batch_limit
  LOOP
    -- Reserva a tentativa antes de disparar (evita disparo duplicado pelo próximo cron tick)
    UPDATE public.rma_analysis_results
       SET auto_retry_count = COALESCE(auto_retry_count, 0) + 1,
           last_auto_retry_at = now(),
           updated_at = now(),
           log = COALESCE(log, '[]'::jsonb) || jsonb_build_array(
             format('[%s] [auto-retry #%s] disparando nova execução da pipeline',
                    to_char(now(),'YYYY-MM-DD HH24:MI:SS'), r.tries + 1)
           )
     WHERE id = r.id;

    -- Dispara rma-analyze via HTTP interno
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

    company_id := r.cid;
    retry_attempt := r.tries + 1;
    request_id := req_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_retry_failed_rma_runs(text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_retry_failed_rma_runs(text, text, integer, integer, integer) TO postgres, service_role;

-- 3) Reseta contador quando run volta a concluir com sucesso (limpa histórico)
CREATE OR REPLACE FUNCTION public.trg_reset_auto_retry_on_success()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluido' AND OLD.status <> 'concluido' THEN
    NEW.auto_retry_count := 0;
    NEW.last_auto_retry_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_auto_retry ON public.rma_analysis_results;
CREATE TRIGGER trg_reset_auto_retry
BEFORE UPDATE ON public.rma_analysis_results
FOR EACH ROW
EXECUTE FUNCTION public.trg_reset_auto_retry_on_success();