-- Histórico de validações cross-doc por empresa/RMA/período
CREATE TABLE public.cross_validation_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  rma_id text,
  ano integer,
  mes integer,
  score numeric NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  checked integer NOT NULL DEFAULT 0,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  persisted_versions integer NOT NULL DEFAULT 0,
  triggered_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_cross_val_runs_lookup
  ON public.cross_validation_runs (company_id, ano, mes, created_at DESC);

ALTER TABLE public.cross_validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam cross_validation_runs"
ON public.cross_validation_runs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner visualiza cross_validation_runs"
ON public.cross_validation_runs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  OR EXISTS (SELECT 1 FROM companies c WHERE c.id = cross_validation_runs.company_id AND c.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = cross_validation_runs.company_id AND cc.consultant_user_id = auth.uid())
);