
-- 1. ai_cost_config: tabela de preços vigentes
CREATE TABLE IF NOT EXISTS public.ai_cost_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  service TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  cost_per_1k_input  NUMERIC(18,8) NOT NULL DEFAULT 0,
  cost_per_1k_output NUMERIC(18,8) NOT NULL DEFAULT 0,
  cost_per_request   NUMERIC(18,8) NOT NULL DEFAULT 0,
  cost_per_page      NUMERIC(18,8) NOT NULL DEFAULT 0,
  cost_fixed         NUMERIC(18,8) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  active BOOLEAN DEFAULT true,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_cost_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read cost config" ON public.ai_cost_config
  FOR SELECT TO authenticated USING (true);

-- Tenta usar role gestor_ia se existir; senão libera para autenticados
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_role') THEN
    EXECUTE $POL$
      CREATE POLICY "write cost config" ON public.ai_cost_config
        FOR ALL TO authenticated
        USING (public.has_role(auth.uid(), 'gestor_ia'::app_role))
        WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role))
    $POL$;
  ELSE
    EXECUTE $POL$
      CREATE POLICY "write cost config" ON public.ai_cost_config
        FOR ALL TO authenticated USING (true) WITH CHECK (true)
    $POL$;
  END IF;
EXCEPTION WHEN others THEN
  EXECUTE 'CREATE POLICY "write cost config" ON public.ai_cost_config FOR ALL TO authenticated USING (true) WITH CHECK (true)';
END $$;

-- 2. ai_usage_logs: uso real (append-only)
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  service TEXT NOT NULL,
  document_id UUID,
  tokens_input  NUMERIC DEFAULT 0,
  tokens_output NUMERIC DEFAULT 0,
  requests NUMERIC DEFAULT 0,
  pages    NUMERIC DEFAULT 0,
  cost_calculated NUMERIC(18,8) DEFAULT 0,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_service    ON public.ai_usage_logs(service);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_document   ON public.ai_usage_logs(document_id);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read logs"   ON public.ai_usage_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert logs" ON public.ai_usage_logs FOR INSERT TO authenticated WITH CHECK (true);
-- UPDATE/DELETE bloqueados (sem policy) → imutabilidade

-- 3. Função de cálculo + trigger
CREATE OR REPLACE FUNCTION public.calculate_ai_cost(
  p_service TEXT, p_tokens_input NUMERIC, p_tokens_output NUMERIC,
  p_requests NUMERIC, p_pages NUMERIC
) RETURNS NUMERIC LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE cfg RECORD; total NUMERIC := 0; norm_service TEXT;
BEGIN
  SELECT * INTO cfg FROM public.ai_cost_config
   WHERE service = p_service AND active = true LIMIT 1;
  IF NOT FOUND THEN
    norm_service := replace(replace(p_service,'-','_'),'.','_');
    SELECT * INTO cfg FROM public.ai_cost_config
     WHERE service = norm_service AND active = true LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN 0; END IF;
  total :=
    COALESCE((p_tokens_input  / 1000.0) * cfg.cost_per_1k_input,  0) +
    COALESCE((p_tokens_output / 1000.0) * cfg.cost_per_1k_output, 0) +
    COALESCE(p_requests * cfg.cost_per_request, 0) +
    COALESCE(p_pages    * cfg.cost_per_page,    0) +
    COALESCE(cfg.cost_fixed, 0);
  RETURN total;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_calculate_cost() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.cost_calculated IS NULL OR NEW.cost_calculated = 0 THEN
    NEW.cost_calculated := public.calculate_ai_cost(
      NEW.service, NEW.tokens_input, NEW.tokens_output, NEW.requests, NEW.pages);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ai_usage_logs_cost ON public.ai_usage_logs;
CREATE TRIGGER trg_ai_usage_logs_cost
BEFORE INSERT ON public.ai_usage_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_calculate_cost();

-- 4. View ai_cost_summary
CREATE OR REPLACE VIEW public.ai_cost_summary AS
SELECT service,
       COUNT(*)             AS total_logs,
       SUM(tokens_input)    AS tokens_input,
       SUM(tokens_output)   AS tokens_output,
       SUM(requests)        AS requests,
       SUM(pages)           AS pages,
       SUM(cost_calculated) AS total_cost,
       MAX(created_at)      AS last_used_at
FROM public.ai_usage_logs GROUP BY service;

-- 5. Diagnóstico SQL
CREATE OR REPLACE FUNCTION public.ai_cost_diagnostics() RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result json;
BEGIN
  SELECT json_build_object(
    'maior_custo_servico', (SELECT service FROM public.ai_cost_summary ORDER BY total_cost DESC NULLS LAST LIMIT 1),
    'custo_total',         (SELECT COALESCE(SUM(cost_calculated),0) FROM public.ai_usage_logs),
    'custo_por_tipo',      (SELECT COALESCE(json_agg(row_to_json(t)),'[]'::json)
                            FROM (SELECT type, SUM(cost_calculated) AS total
                                  FROM public.ai_usage_logs GROUP BY type) t)
  ) INTO result; RETURN result;
END; $$;

-- 6. Seeds de preços (faixa real 2025-2026)
INSERT INTO public.ai_cost_config (provider, service, label, cost_per_1k_input, cost_per_1k_output, cost_per_page, notes) VALUES
  ('google', 'gemini_2_5_flash',     'Gemini 2.5 Flash',    0.000075, 0.0003,  0, 'Mapping/normalização'),
  ('google', 'gemini_2_5_pro',       'Gemini 2.5 Pro',      0.00125,  0.005,   0, 'Insights finais'),
  ('google', 'gemini_2_5_flash_lite','Gemini 2.5 Flash-Lite', 0.00001, 0.00004, 0, 'Classificação/baixo custo'),
  ('google', 'document_ai',          'Google Document AI',  0,        0,       0.0015, 'OCR por página'),
  ('google', 'embedding',            'text-embedding-004',  0.00001,  0,       0, 'Vetores 768D'),
  ('openai', 'openai_gpt5_mini',     'OpenAI GPT-5 mini',   0.00015,  0.0006,  0, 'Fallback financeiro')
ON CONFLICT (service) DO NOTHING;
