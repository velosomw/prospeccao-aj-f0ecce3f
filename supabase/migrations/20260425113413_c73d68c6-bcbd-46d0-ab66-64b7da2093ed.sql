
-- ===== Tabela de liberações de RMA para Magistrado/Recuperanda =====
CREATE TABLE IF NOT EXISTS public.rma_release_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  released_to_user_id UUID NOT NULL,
  released_to_role public.app_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  notes TEXT,
  released_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, year, month, released_to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_rra_user ON public.rma_release_assignments (released_to_user_id);
CREATE INDEX IF NOT EXISTS idx_rra_company ON public.rma_release_assignments (company_id);

ALTER TABLE public.rma_release_assignments ENABLE ROW LEVEL SECURITY;

-- Admins (coordenador / gestor) — full
CREATE POLICY "admins_select_rra" ON public.rma_release_assignments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::public.app_role)
    OR public.has_role(auth.uid(), 'coordenador'::public.app_role)
    OR released_to_user_id = auth.uid()
  );

CREATE POLICY "admins_insert_rra" ON public.rma_release_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor_ia'::public.app_role)
    OR public.has_role(auth.uid(), 'coordenador'::public.app_role)
  );

CREATE POLICY "admins_update_rra" ON public.rma_release_assignments
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::public.app_role)
    OR public.has_role(auth.uid(), 'coordenador'::public.app_role)
  );

CREATE POLICY "admins_delete_rra" ON public.rma_release_assignments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::public.app_role)
    OR public.has_role(auth.uid(), 'coordenador'::public.app_role)
  );

-- Trigger updated_at
CREATE TRIGGER trg_rra_updated_at
BEFORE UPDATE ON public.rma_release_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Permitir que magistrado/recuperanda leiam companies/period quando há liberação ativa =====
CREATE POLICY "released_select_companies" ON public.companies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rma_release_assignments rra
      WHERE rra.company_id = companies.id
        AND rra.released_to_user_id = auth.uid()
        AND rra.status = 'active'
    )
  );

CREATE POLICY "released_select_period_analyses" ON public.rma_period_analyses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rma_release_assignments rra
      WHERE rra.company_id = rma_period_analyses.company_id
        AND rra.released_to_user_id = auth.uid()
        AND rra.status = 'active'
        AND rra.year = rma_period_analyses.year
        AND rra.month = rma_period_analyses.month
    )
  );
