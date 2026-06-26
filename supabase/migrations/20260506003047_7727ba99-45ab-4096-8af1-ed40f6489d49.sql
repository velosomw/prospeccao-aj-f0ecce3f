-- Fase 7 — Alertas e insights financeiros automáticos
CREATE TABLE IF NOT EXISTS public.financial_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  ano INTEGER,
  mes INTEGER,
  severidade TEXT NOT NULL CHECK (severidade IN ('info','ok','warn','bad')),
  origem TEXT NOT NULL CHECK (origem IN ('rule','ai')),
  categoria TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  recomendacao TEXT,
  metricas JSONB DEFAULT '{}'::jsonb,
  periodo_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_alerts_company ON public.financial_alerts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_alerts_periodo ON public.financial_alerts(company_id, ano, mes);

ALTER TABLE public.financial_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read financial_alerts" ON public.financial_alerts;
CREATE POLICY "Authenticated can read financial_alerts"
  ON public.financial_alerts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role manages financial_alerts" ON public.financial_alerts;
CREATE POLICY "Service role manages financial_alerts"
  ON public.financial_alerts FOR ALL
  TO service_role USING (true) WITH CHECK (true);
