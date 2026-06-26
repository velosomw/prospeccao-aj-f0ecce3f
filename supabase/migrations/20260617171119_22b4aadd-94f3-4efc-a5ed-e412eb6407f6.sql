
-- Helper: acesso por rma_id (text) via companies
CREATE OR REPLACE FUNCTION public.can_access_company_by_rma(p_rma_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.rma_id = p_rma_id
      AND public.can_access_company(c.id)
  );
$$;

-- ai_extractions
DROP POLICY IF EXISTS "Consultor visualiza ai_extractions" ON public.ai_extractions;
CREATE POLICY "Consultor visualiza ai_extractions scoped" ON public.ai_extractions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND (
    (rma_id IS NOT NULL AND public.can_access_company_by_rma(rma_id))
    OR (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
  )
);

-- dataset_validated
DROP POLICY IF EXISTS "Consultor visualiza dataset_validated" ON public.dataset_validated;
CREATE POLICY "Consultor visualiza dataset_validated scoped" ON public.dataset_validated
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND (
    (rma_id IS NOT NULL AND public.can_access_company_by_rma(rma_id))
    OR (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
  )
);

-- document_embeddings
DROP POLICY IF EXISTS "Consultor read document_embeddings" ON public.document_embeddings;
CREATE POLICY "Consultor read document_embeddings scoped" ON public.document_embeddings
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND (
    (rma_id IS NOT NULL AND public.can_access_company_by_rma(rma_id))
    OR (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
  )
);

-- document_latest (sem rma_id/company_id direto — via document_state.company_id)
DROP POLICY IF EXISTS "Consultor visualiza document_latest" ON public.document_latest;
CREATE POLICY "Consultor visualiza document_latest scoped" ON public.document_latest
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.document_state ds
    WHERE ds.document_id = document_latest.document_id
      AND ds.company_id IS NOT NULL
      AND public.can_access_company(ds.company_id)
  )
);

-- document_versions (sem company/rma direto — via document_state)
DROP POLICY IF EXISTS "Consultor visualiza document_versions" ON public.document_versions;
CREATE POLICY "Consultor visualiza document_versions scoped" ON public.document_versions
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.document_state ds
    WHERE ds.document_id = document_versions.document_id
      AND ds.company_id IS NOT NULL
      AND public.can_access_company(ds.company_id)
  )
);

-- fraud_alerts
DROP POLICY IF EXISTS "Consultor visualiza fraud_alerts" ON public.fraud_alerts;
CREATE POLICY "Consultor visualiza fraud_alerts scoped" ON public.fraud_alerts
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND (
    (rma_id IS NOT NULL AND public.can_access_company_by_rma(rma_id))
    OR (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
  )
);

-- nfe_compras
DROP POLICY IF EXISTS "nfe_compras consultor read" ON public.nfe_compras;
CREATE POLICY "nfe_compras consultor read scoped" ON public.nfe_compras
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND (
    (company_id IS NOT NULL AND public.can_access_company(company_id))
    OR (rma_id IS NOT NULL AND public.can_access_company_by_rma(rma_id))
  )
);

-- ocr_embeddings
DROP POLICY IF EXISTS "Consultor visualiza ocr_embeddings" ON public.ocr_embeddings;
CREATE POLICY "Consultor visualiza ocr_embeddings scoped" ON public.ocr_embeddings
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND (
    (rma_id IS NOT NULL AND public.can_access_company_by_rma(rma_id))
    OR (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
  )
);

-- ocr_results
DROP POLICY IF EXISTS "consultor_select_ocr_results" ON public.ocr_results;
CREATE POLICY "consultor_select_ocr_results_scoped" ON public.ocr_results
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND (
    (rma_id IS NOT NULL AND public.can_access_company_by_rma(rma_id))
    OR (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
  )
);

-- pipeline_documents
DROP POLICY IF EXISTS "Consultor read pipeline_documents" ON public.pipeline_documents;
CREATE POLICY "Consultor read pipeline_documents scoped" ON public.pipeline_documents
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'consultor'::app_role)
  AND rma_id IS NOT NULL
  AND public.can_access_company_by_rma(rma_id)
);

-- user_roles: DELETE policy explícita (apenas Gestor IA)
DROP POLICY IF EXISTS "Only gestor_ia can delete roles" ON public.user_roles;
CREATE POLICY "Only gestor_ia can delete roles" ON public.user_roles
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'gestor_ia'::app_role));

-- Storage policies explícitas para rma-documents (DELETE/UPDATE restrito)
DROP POLICY IF EXISTS "rma_documents_delete_admin_only" ON storage.objects;
CREATE POLICY "rma_documents_delete_admin_only" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'rma-documents'
  AND has_role(auth.uid(), 'gestor_ia'::app_role)
);

DROP POLICY IF EXISTS "rma_documents_update_admin_only" ON storage.objects;
CREATE POLICY "rma_documents_update_admin_only" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'rma-documents'
  AND (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
)
WITH CHECK (
  bucket_id = 'rma-documents'
  AND (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
);

-- Storage policies explícitas para cobranca-attachments (DELETE/UPDATE restrito)
DROP POLICY IF EXISTS "cobranca_attachments_delete_admin_only" ON storage.objects;
CREATE POLICY "cobranca_attachments_delete_admin_only" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'cobranca-attachments'
  AND (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
);

DROP POLICY IF EXISTS "cobranca_attachments_update_admin_only" ON storage.objects;
CREATE POLICY "cobranca_attachments_update_admin_only" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'cobranca-attachments'
  AND (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
)
WITH CHECK (
  bucket_id = 'cobranca-attachments'
  AND (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
);
