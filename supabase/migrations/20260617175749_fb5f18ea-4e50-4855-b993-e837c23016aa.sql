
CREATE TABLE IF NOT EXISTS public.rma_period_chain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  sequence_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','triggered','done','erro','skipped')),
  triggered_at timestamptz,
  finished_at timestamptz,
  last_check_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_rma_period_chain_company_seq
  ON public.rma_period_chain (company_id, sequence_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rma_period_chain TO authenticated;
GRANT ALL ON public.rma_period_chain TO service_role;

ALTER TABLE public.rma_period_chain ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rma_period_chain_select_access"
  ON public.rma_period_chain FOR SELECT
  TO authenticated
  USING (public.can_access_company(company_id));

CREATE POLICY "rma_period_chain_manage_coord"
  ON public.rma_period_chain FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
    OR public.can_access_company(company_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
    OR public.can_access_company(company_id)
  );

CREATE TRIGGER trg_rma_period_chain_updated_at
  BEFORE UPDATE ON public.rma_period_chain
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
