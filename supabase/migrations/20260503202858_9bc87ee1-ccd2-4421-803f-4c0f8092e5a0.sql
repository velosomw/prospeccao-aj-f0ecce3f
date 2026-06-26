-- 1) Reduzir retries: 3 -> 1 (jobs novos) e atualizar pendentes
ALTER TABLE public.processing_queue ALTER COLUMN max_attempts SET DEFAULT 1;

UPDATE public.processing_queue
   SET max_attempts = 1
 WHERE status IN ('pending','processing')
   AND max_attempts > 1;

-- 2) Tabela de configuração do circuit breaker de custo IA
CREATE TABLE IF NOT EXISTS public.ai_cost_circuit_breaker (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  hourly_usd_limit numeric(10,4) NOT NULL DEFAULT 1.50,
  daily_usd_limit  numeric(10,4) NOT NULL DEFAULT 10.00,
  pause_until timestamptz,
  last_trip_at timestamptz,
  last_trip_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton_row CHECK (id = 1)
);

INSERT INTO public.ai_cost_circuit_breaker (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ai_cost_circuit_breaker ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor IA gerencia circuit breaker" ON public.ai_cost_circuit_breaker;
CREATE POLICY "Gestor IA gerencia circuit breaker"
  ON public.ai_cost_circuit_breaker
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'gestor_ia'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'gestor_ia'::app_role));

DROP POLICY IF EXISTS "Coordenador lê circuit breaker" ON public.ai_cost_circuit_breaker;
CREATE POLICY "Coordenador lê circuit breaker"
  ON public.ai_cost_circuit_breaker
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'coordenador'::app_role)
      OR public.has_role(auth.uid(),'gestor_ia'::app_role));

-- 3) Função utilitária: deve pausar consumo IA agora?
CREATE OR REPLACE FUNCTION public.ai_cost_should_pause()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg public.ai_cost_circuit_breaker;
  hourly numeric := 0;
  daily  numeric := 0;
BEGIN
  SELECT * INTO cfg FROM public.ai_cost_circuit_breaker WHERE id = 1;
  IF NOT FOUND OR NOT cfg.enabled THEN
    RETURN jsonb_build_object('paused', false, 'reason', 'disabled');
  END IF;

  IF cfg.pause_until IS NOT NULL AND cfg.pause_until > now() THEN
    RETURN jsonb_build_object('paused', true, 'reason', 'manual_pause',
      'pause_until', cfg.pause_until);
  END IF;

  SELECT COALESCE(SUM(cost_calculated),0) INTO hourly
    FROM public.ai_usage_logs
   WHERE created_at > now() - interval '1 hour';

  SELECT COALESCE(SUM(cost_calculated),0) INTO daily
    FROM public.ai_usage_logs
   WHERE created_at > now() - interval '24 hours';

  IF hourly >= cfg.hourly_usd_limit THEN
    RETURN jsonb_build_object('paused', true, 'reason', 'hourly_limit',
      'hourly_usd', hourly, 'limit_usd', cfg.hourly_usd_limit);
  END IF;

  IF daily >= cfg.daily_usd_limit THEN
    RETURN jsonb_build_object('paused', true, 'reason', 'daily_limit',
      'daily_usd', daily, 'limit_usd', cfg.daily_usd_limit);
  END IF;

  RETURN jsonb_build_object('paused', false,
    'hourly_usd', hourly, 'daily_usd', daily);
END; $$;

GRANT EXECUTE ON FUNCTION public.ai_cost_should_pause() TO authenticated, service_role;