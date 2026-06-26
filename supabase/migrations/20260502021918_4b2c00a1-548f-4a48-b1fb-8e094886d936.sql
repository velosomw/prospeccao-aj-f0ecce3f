ALTER TABLE public.rma_documents
  ADD COLUMN IF NOT EXISTS arquivo_final_url text,
  ADD COLUMN IF NOT EXISTS arquivo_final_versao integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arquivo_final_gerado_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivo_final_pct integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.rma_document_progress(p_document_id uuid)
RETURNS TABLE(total int, ok int, pct int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status IN ('aprovado','concluido'))::int,
    CASE WHEN COUNT(*) = 0 THEN 0
         ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('aprovado','concluido')) / COUNT(*))::int
    END
  FROM public.rma_document_sections
  WHERE document_id = p_document_id;
$$;

-- Storage: permitir leitura autenticada de pareceres finais
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='auth read rma-documents finals'
  ) THEN
    CREATE POLICY "auth read rma-documents finals"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'rma-documents');
  END IF;
END $$;