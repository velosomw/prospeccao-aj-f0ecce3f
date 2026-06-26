
-- 1. Novos campos em companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS auto_monthly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS execution_year integer,
  ADD COLUMN IF NOT EXISTS period_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_period_month integer,
  ADD COLUMN IF NOT EXISTS last_analyzed_period text;

-- 2. Tabela de histórico de análises por período
CREATE TABLE IF NOT EXISTS public.rma_period_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  period_label text NOT NULL, -- formato MM-YYYY
  status text NOT NULL DEFAULT 'em_analise',
  percentual integer NOT NULL DEFAULT 0,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  diagnostico jsonb,
  indicadores jsonb,
  kanitz jsonb,
  score_rj jsonb,
  pendencias jsonb,
  alertas jsonb,
  balanco jsonb,
  dre jsonb,
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_rma_period_company ON public.rma_period_analyses(company_id);
CREATE INDEX IF NOT EXISTS idx_rma_period_year_month ON public.rma_period_analyses(year, month);

ALTER TABLE public.rma_period_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_insert_period_analyses"
  ON public.rma_period_analyses FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "admin_update_period_analyses"
  ON public.rma_period_analyses FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "select_period_analyses"
  ON public.rma_period_analyses FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenador'::app_role)
    OR EXISTS (SELECT 1 FROM public.company_consultants cc WHERE cc.company_id = rma_period_analyses.company_id AND cc.consultant_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = rma_period_analyses.company_id AND c.created_by = auth.uid())
  );

CREATE TRIGGER trg_rma_period_analyses_updated
  BEFORE UPDATE ON public.rma_period_analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
