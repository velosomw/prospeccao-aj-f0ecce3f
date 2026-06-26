DROP POLICY IF EXISTS owner_select_companies ON public.companies;

CREATE POLICY owner_select_companies
ON public.companies FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.company_consultants cc
    WHERE cc.company_id = companies.id AND cc.consultant_user_id = auth.uid()
  )
);