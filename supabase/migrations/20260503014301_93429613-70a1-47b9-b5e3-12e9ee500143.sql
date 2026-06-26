-- Semantic cache for LLM responses (avoids reprocessing identical prompts)
CREATE TABLE IF NOT EXISTS public.llm_response_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash text NOT NULL UNIQUE,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_preview text,
  response jsonb NOT NULL,
  tokens_input integer,
  tokens_output integer,
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_llm_cache_provider_model ON public.llm_response_cache(provider, model);
CREATE INDEX IF NOT EXISTS idx_llm_cache_expires ON public.llm_response_cache(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.llm_response_cache ENABLE ROW LEVEL SECURITY;

-- Only admin/coord roles can read; writes are service-role only (edge functions)
CREATE POLICY "llm_cache_read_admin"
  ON public.llm_response_cache FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role));

-- Atomic hit-counter RPC
CREATE OR REPLACE FUNCTION public.bump_llm_cache_hit(p_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.llm_response_cache
     SET hit_count = hit_count + 1,
         last_hit_at = now()
   WHERE prompt_hash = p_hash;
$$;