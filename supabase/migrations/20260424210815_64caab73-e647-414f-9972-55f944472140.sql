
CREATE TABLE public.rma_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
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
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rma_analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consultant_or_admin_select_rma_analysis"
ON public.rma_analysis_results FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.company_consultants cc
    WHERE cc.company_id = rma_analysis_results.company_id
      AND cc.consultant_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = rma_analysis_results.company_id
      AND c.created_by = auth.uid()
  )
);

CREATE POLICY "admin_insert_rma_analysis"
ON public.rma_analysis_results FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
);

CREATE POLICY "admin_update_rma_analysis"
ON public.rma_analysis_results FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
);

CREATE TRIGGER rma_analysis_results_updated_at
BEFORE UPDATE ON public.rma_analysis_results
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_rma_analysis_company ON public.rma_analysis_results(company_id);
