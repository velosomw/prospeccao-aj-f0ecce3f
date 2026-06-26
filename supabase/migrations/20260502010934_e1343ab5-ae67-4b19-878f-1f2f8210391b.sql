
-- Tabela de buckets por provider/modelo
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  -- limites
  max_requests_per_minute integer NOT NULL DEFAULT 60,
  max_tokens_per_minute integer,
  -- estado corrente
  requests_in_window integer NOT NULL DEFAULT 0,
  tokens_in_window integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  -- bloqueio quando provider responde 429
  blocked_until timestamptz,
  last_block_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model)
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam rate_limit_buckets"
  ON public.rate_limit_buckets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'gestor_ia'::app_role) OR public.has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'gestor_ia'::app_role) OR public.has_role(auth.uid(),'coordenador'::app_role));

CREATE POLICY "Autenticados leem rate_limit_buckets"
  ON public.rate_limit_buckets FOR SELECT TO authenticated
  USING (true);

-- Seed dos buckets padrão (Gemini)
INSERT INTO public.rate_limit_buckets (provider, model, max_requests_per_minute, max_tokens_per_minute) VALUES
  ('lovable_ai', 'google/gemini-2.5-flash-lite', 60, 120000),
  ('lovable_ai', 'google/gemini-2.5-flash', 30, 60000),
  ('lovable_ai', 'google/gemini-2.5-pro', 10, 32000)
ON CONFLICT (provider, model) DO NOTHING;

-- Verifica se pode prosseguir; retorna { allowed, retry_after_ms }
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_provider text, p_model text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.rate_limit_buckets;
  retry_ms integer;
BEGIN
  SELECT * INTO b FROM public.rate_limit_buckets
   WHERE provider = p_provider AND model = p_model
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'retry_after_ms', 0, 'reason', 'no_bucket');
  END IF;

  -- bloqueado por 429?
  IF b.blocked_until IS NOT NULL AND b.blocked_until > now() THEN
    retry_ms := GREATEST(1000, CEIL(EXTRACT(EPOCH FROM (b.blocked_until - now())) * 1000)::integer);
    RETURN jsonb_build_object('allowed', false, 'retry_after_ms', retry_ms, 'reason', 'blocked');
  END IF;

  -- janela expirou? reseta
  IF b.window_started_at < now() - interval '60 seconds' THEN
    UPDATE public.rate_limit_buckets
       SET requests_in_window = 0, tokens_in_window = 0, window_started_at = now(), updated_at = now()
     WHERE id = b.id;
    RETURN jsonb_build_object('allowed', true, 'retry_after_ms', 0, 'reason', 'window_reset');
  END IF;

  -- estourou requests/min?
  IF b.requests_in_window >= b.max_requests_per_minute THEN
    retry_ms := CEIL(EXTRACT(EPOCH FROM (b.window_started_at + interval '60 seconds' - now())) * 1000)::integer;
    RETURN jsonb_build_object('allowed', false, 'retry_after_ms', GREATEST(retry_ms, 1000), 'reason', 'rpm_exceeded');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'retry_after_ms', 0, 'reason', 'ok');
END;
$$;

-- Consome 1 request (e tokens opcionais)
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_provider text, p_model text, p_tokens integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rate_limit_buckets
     SET requests_in_window = requests_in_window + 1,
         tokens_in_window = tokens_in_window + COALESCE(p_tokens,0),
         updated_at = now()
   WHERE provider = p_provider AND model = p_model;
END;
$$;

-- Bloqueia bucket por N ms (chamado quando provider devolve 429)
CREATE OR REPLACE FUNCTION public.block_rate_limit(p_provider text, p_model text, p_retry_after_ms integer, p_reason text DEFAULT 'provider_429')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.rate_limit_buckets
     SET blocked_until = now() + make_interval(secs => GREATEST(1, CEIL(p_retry_after_ms/1000.0)::integer)),
         last_block_reason = p_reason,
         updated_at = now()
   WHERE provider = p_provider AND model = p_model;

  -- Se não existir, cria com bloqueio
  IF NOT FOUND THEN
    INSERT INTO public.rate_limit_buckets (provider, model, blocked_until, last_block_reason)
    VALUES (p_provider, p_model,
            now() + make_interval(secs => GREATEST(1, CEIL(p_retry_after_ms/1000.0)::integer)),
            p_reason);
  END IF;
END;
$$;

-- Cron para liberar fila quando bucket expira
CREATE OR REPLACE FUNCTION public.requeue_rate_limited_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer := 0;
BEGIN
  -- Jobs em pending bloqueados por rate_limit cujo bucket já liberou
  WITH unblocked AS (
    SELECT pq.id
      FROM public.processing_queue pq
     WHERE pq.status = 'pending'
       AND pq.block_reason = 'rate_limit'
       AND pq.next_attempt_at <= now()
       AND NOT EXISTS (
         SELECT 1 FROM public.rate_limit_buckets b
          WHERE b.blocked_until IS NOT NULL AND b.blocked_until > now()
       )
  )
  UPDATE public.processing_queue pq
     SET block_reason = NULL, updated_at = now()
   WHERE pq.id IN (SELECT id FROM unblocked);

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Coluna de chunking na queue (para Fase 3)
ALTER TABLE public.processing_queue
  ADD COLUMN IF NOT EXISTS parent_job_id uuid,
  ADD COLUMN IF NOT EXISTS chunk_index integer,
  ADD COLUMN IF NOT EXISTS chunks_total integer,
  ADD COLUMN IF NOT EXISTS chunk_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_processing_queue_parent ON public.processing_queue(parent_job_id) WHERE parent_job_id IS NOT NULL;

-- View para UI de pasta (contadores agregados)
CREATE OR REPLACE VIEW public.folder_processing_status AS
SELECT
  pq.company_id,
  pq.rma_id,
  COALESCE(pq.payload->>'folder_path', 'unknown') AS folder_path,
  COUNT(*) FILTER (WHERE pq.status = 'done') AS done_count,
  COUNT(*) FILTER (WHERE pq.status = 'processing') AS processing_count,
  COUNT(*) FILTER (WHERE pq.status = 'pending' AND pq.block_reason = 'rate_limit') AS rate_limited_count,
  COUNT(*) FILTER (WHERE pq.status = 'pending' AND COALESCE(pq.block_reason,'') <> 'rate_limit') AS pending_count,
  COUNT(*) FILTER (WHERE pq.status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE pq.parent_job_id IS NOT NULL) AS chunk_count,
  COUNT(*) AS total_count,
  MIN(pq.next_attempt_at) FILTER (WHERE pq.status = 'pending' AND pq.block_reason = 'rate_limit') AS rate_limit_until,
  MAX(pq.updated_at) AS last_activity_at
FROM public.processing_queue pq
GROUP BY pq.company_id, pq.rma_id, COALESCE(pq.payload->>'folder_path', 'unknown');

GRANT SELECT ON public.folder_processing_status TO authenticated;
