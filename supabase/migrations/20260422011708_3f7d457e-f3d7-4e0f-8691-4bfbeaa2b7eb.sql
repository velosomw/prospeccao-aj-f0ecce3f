CREATE TABLE public.rma_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('assign','move','unassign')),
  from_consultant_user_id uuid,
  to_consultant_user_id uuid,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rma_history_company ON public.rma_assignment_history(company_id);
CREATE INDEX idx_rma_history_created ON public.rma_assignment_history(created_at DESC);

ALTER TABLE public.rma_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_select_rma_history"
ON public.rma_assignment_history FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
  OR from_consultant_user_id = auth.uid()
  OR to_consultant_user_id = auth.uid()
);

CREATE POLICY "admins_insert_rma_history"
ON public.rma_assignment_history FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
);