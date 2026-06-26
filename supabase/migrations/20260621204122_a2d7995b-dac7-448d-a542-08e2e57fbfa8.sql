
-- Permite consultores responsáveis pela empresa fazer INSERT/UPDATE em onedrive_files
CREATE POLICY "Consultor/owner gerencia onedrive_files"
ON public.onedrive_files
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'consultor'::app_role)
  OR EXISTS (SELECT 1 FROM companies c WHERE c.id = onedrive_files.company_id AND c.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = onedrive_files.company_id AND cc.consultant_user_id = auth.uid())
);

CREATE POLICY "Consultor/owner atualiza onedrive_files"
ON public.onedrive_files
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  OR EXISTS (SELECT 1 FROM companies c WHERE c.id = onedrive_files.company_id AND c.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = onedrive_files.company_id AND cc.consultant_user_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'consultor'::app_role)
  OR EXISTS (SELECT 1 FROM companies c WHERE c.id = onedrive_files.company_id AND c.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM company_consultants cc WHERE cc.company_id = onedrive_files.company_id AND cc.consultant_user_id = auth.uid())
);

-- Permite recuperandas (com RMA liberado para a empresa) fazer INSERT/UPDATE
CREATE POLICY "Recuperanda gerencia onedrive_files liberados"
ON public.onedrive_files
FOR INSERT
TO authenticated
WITH CHECK (public.is_company_released_to_user(company_id));

CREATE POLICY "Recuperanda atualiza onedrive_files liberados"
ON public.onedrive_files
FOR UPDATE
TO authenticated
USING (public.is_company_released_to_user(company_id))
WITH CHECK (public.is_company_released_to_user(company_id));
