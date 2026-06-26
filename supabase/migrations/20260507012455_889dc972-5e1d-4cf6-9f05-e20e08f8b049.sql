CREATE OR REPLACE FUNCTION public.is_company_released_to_user(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.rma_release_assignments rra
     WHERE rra.company_id = _company_id
       AND rra.released_to_user_id = auth.uid()
       AND rra.status = 'active'
  );
$$;

DROP POLICY IF EXISTS "Recuperanda visualiza onedrive_files liberados" ON public.onedrive_files;
CREATE POLICY "Recuperanda visualiza onedrive_files liberados"
  ON public.onedrive_files
  FOR SELECT
  TO authenticated
  USING (public.is_company_released_to_user(company_id));

DROP POLICY IF EXISTS "Recuperanda visualiza pipeline_documents liberados" ON public.pipeline_documents;
CREATE POLICY "Recuperanda visualiza pipeline_documents liberados"
  ON public.pipeline_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.companies c
       WHERE c.rma_id = pipeline_documents.rma_id
         AND public.is_company_released_to_user(c.id)
    )
  );

DROP POLICY IF EXISTS "Recuperanda visualiza rma_analysis_results liberados" ON public.rma_analysis_results;
CREATE POLICY "Recuperanda visualiza rma_analysis_results liberados"
  ON public.rma_analysis_results
  FOR SELECT
  TO authenticated
  USING (public.is_company_released_to_user(company_id));