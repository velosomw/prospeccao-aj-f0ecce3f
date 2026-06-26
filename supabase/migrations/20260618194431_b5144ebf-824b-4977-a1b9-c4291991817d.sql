DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rma_file_parse_cache'
      AND policyname = 'Usuarios com RMA liberado visualizam cache financeiro'
  ) THEN
    CREATE POLICY "Usuarios com RMA liberado visualizam cache financeiro"
    ON public.rma_file_parse_cache
    FOR SELECT
    TO authenticated
    USING (public.is_company_released_to_user(company_id));
  END IF;
END $$;