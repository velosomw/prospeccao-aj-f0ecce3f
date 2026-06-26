DROP POLICY IF EXISTS owner_delete_companies ON public.companies;
CREATE POLICY owner_delete_companies ON public.companies
FOR DELETE USING (
  (created_by = auth.uid())
  OR has_role(auth.uid(), 'gestor_ia'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
);