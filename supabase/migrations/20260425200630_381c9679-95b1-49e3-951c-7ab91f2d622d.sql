-- Add quality engine columns to ai_extractions
ALTER TABLE public.ai_extractions
  ADD COLUMN IF NOT EXISTS validation_score numeric,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS quality_action text DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS auto_retry_count integer NOT NULL DEFAULT 0;

-- Fraud alerts table
CREATE TABLE IF NOT EXISTS public.fraud_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id uuid REFERENCES public.ai_extractions(id) ON DELETE CASCADE,
  document_id uuid,
  rma_id text,
  classe text,
  alert_type text NOT NULL, -- 'duplicate' | 'outlier' | 'inconsistency'
  severity text NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open', -- 'open' | 'acknowledged' | 'resolved' | 'false_positive'
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_status ON public.fraud_alerts(status);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_rma ON public.fraud_alerts(rma_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_created ON public.fraud_alerts(created_at DESC);

ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam fraud_alerts"
  ON public.fraud_alerts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor visualiza fraud_alerts"
  ON public.fraud_alerts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultor'::app_role));

-- Outlier detection: returns mean, stddev and z-score for a value within a classe's history
CREATE OR REPLACE FUNCTION public.detect_outliers_by_classe(
  target_classe text,
  field_path text,
  candidate_value numeric
)
RETURNS TABLE(mean numeric, stddev numeric, z_score numeric, sample_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vals AS (
    SELECT (extracted_data #>> string_to_array(field_path, '.'))::numeric AS v
    FROM public.ai_extractions
    WHERE classe = target_classe
      AND status = 'completed'
      AND extracted_data IS NOT NULL
      AND (extracted_data #>> string_to_array(field_path, '.')) ~ '^-?[0-9]+(\.[0-9]+)?$'
  )
  SELECT
    AVG(v)::numeric,
    STDDEV_SAMP(v)::numeric,
    CASE
      WHEN STDDEV_SAMP(v) IS NULL OR STDDEV_SAMP(v) = 0 THEN 0::numeric
      ELSE ((candidate_value - AVG(v)) / STDDEV_SAMP(v))::numeric
    END,
    COUNT(*)::bigint
  FROM vals;
$$;