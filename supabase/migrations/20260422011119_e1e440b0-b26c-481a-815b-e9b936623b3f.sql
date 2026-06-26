CREATE TABLE public.company_consultants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  consultant_user_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, consultant_user_id)
);

CREATE INDEX idx_company_consultants_company ON public.company_consultants(company_id);
CREATE INDEX idx_company_consultants_consultant ON public.company_consultants(consultant_user_id);

ALTER TABLE public.company_consultants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_select_company_consultants"
ON public.company_consultants FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
  OR consultant_user_id = auth.uid()
);

CREATE POLICY "admins_insert_company_consultants"
ON public.company_consultants FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
);

CREATE POLICY "admins_update_company_consultants"
ON public.company_consultants FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
);

CREATE POLICY "admins_delete_company_consultants"
ON public.company_consultants FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
);