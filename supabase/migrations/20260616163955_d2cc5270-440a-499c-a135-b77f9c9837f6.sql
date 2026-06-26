
-- =========================================================================
-- AUDITORIA DE SEGURANÇA PRÉ-PUBLICAÇÃO
-- Fecha 5 ERROR + 5 WARN de exposição de dados detectados pelo scan.
-- =========================================================================

-- 1) Helper central: acesso a uma empresa.
--    Gestor IA / Coordenador → tudo
--    Consultor → criador ou atribuído via company_consultants
--    Liberação ativa via rma_release_assignments
--    Administrador Judicial → empresas das Recuperandas vinculadas
CREATE OR REPLACE FUNCTION public.can_access_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id
      AND (
        public.has_role(auth.uid(), 'gestor_ia'::app_role)
        OR public.has_role(auth.uid(), 'coordenador'::app_role)
        OR (public.has_role(auth.uid(), 'consultor'::app_role) AND (
              c.created_by = auth.uid()
              OR EXISTS (SELECT 1 FROM public.company_consultants cc
                          WHERE cc.company_id = c.id AND cc.consultant_user_id = auth.uid())
            ))
        OR EXISTS (SELECT 1 FROM public.rma_release_assignments r
                    WHERE r.company_id = c.id
                      AND r.released_to_user_id = auth.uid()
                      AND r.status = 'active')
        OR (public.has_role(auth.uid(), 'magistrado'::app_role)
            AND EXISTS (SELECT 1 FROM public.admjudicial_recuperandas ar
                         WHERE ar.admjudicial_user_id = auth.uid()
                           AND ar.recuperanda_user_id = c.created_by))
      )
  );
$$;

-- =========================================================================
-- 2) rma_documents — docs_read USING(true)  →  scoped por can_access_rma_doc
-- =========================================================================
DROP POLICY IF EXISTS docs_read ON public.rma_documents;
CREATE POLICY docs_read ON public.rma_documents
  FOR SELECT TO authenticated
  USING (public.can_access_rma_doc(id));

-- =========================================================================
-- 3) rma_document_sections — sections_read/write USING(true)
-- =========================================================================
DROP POLICY IF EXISTS sections_read  ON public.rma_document_sections;
DROP POLICY IF EXISTS sections_write ON public.rma_document_sections;

CREATE POLICY sections_read ON public.rma_document_sections
  FOR SELECT TO authenticated
  USING (public.can_access_rma_doc(document_id));

CREATE POLICY sections_insert ON public.rma_document_sections
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_rma_doc(document_id));

CREATE POLICY sections_update ON public.rma_document_sections
  FOR UPDATE TO authenticated
  USING (public.can_access_rma_doc(document_id))
  WITH CHECK (public.can_access_rma_doc(document_id));

CREATE POLICY sections_delete ON public.rma_document_sections
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
  );

-- =========================================================================
-- 4) rma_document_section_versions — versions_read/insert USING(true)
-- =========================================================================
DROP POLICY IF EXISTS versions_read   ON public.rma_document_section_versions;
DROP POLICY IF EXISTS versions_insert ON public.rma_document_section_versions;

CREATE POLICY versions_read ON public.rma_document_section_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rma_document_sections s
     WHERE s.id = rma_document_section_versions.section_id
       AND public.can_access_rma_doc(s.document_id)
  ));

CREATE POLICY versions_insert ON public.rma_document_section_versions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rma_document_sections s
     WHERE s.id = rma_document_section_versions.section_id
       AND public.can_access_rma_doc(s.document_id)
  ));

-- =========================================================================
-- 5) rma_document_section_comments — comments_read/insert USING(true)
-- =========================================================================
DROP POLICY IF EXISTS comments_read   ON public.rma_document_section_comments;
DROP POLICY IF EXISTS comments_insert ON public.rma_document_section_comments;

CREATE POLICY comments_read ON public.rma_document_section_comments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rma_document_sections s
     WHERE s.id = rma_document_section_comments.section_id
       AND public.can_access_rma_doc(s.document_id)
  ));

CREATE POLICY comments_insert ON public.rma_document_section_comments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rma_document_sections s
     WHERE s.id = rma_document_section_comments.section_id
       AND public.can_access_rma_doc(s.document_id)
  ));

-- =========================================================================
-- 6) rma_cobrancas — view USING(true)  →  scoped por company
--    Tabela tem rma_id (texto) → join via companies.rma_id
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can view cobrancas" ON public.rma_cobrancas;

CREATE POLICY cobrancas_read ON public.rma_cobrancas
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.companies c
       WHERE c.rma_id = rma_cobrancas.rma_id
         AND public.can_access_company(c.id)
    )
  );

-- =========================================================================
-- 7) financial_alerts — read USING(true)  →  scoped por company_id
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can read financial_alerts" ON public.financial_alerts;

CREATE POLICY financial_alerts_read ON public.financial_alerts
  FOR SELECT TO authenticated
  USING (public.can_access_company(company_id));

-- =========================================================================
-- 8) rma_monthly_snapshots — insert WITH CHECK(true) (injeção possível)
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can insert snapshots via function"
  ON public.rma_monthly_snapshots;

CREATE POLICY monthly_snapshots_insert ON public.rma_monthly_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
  );

-- =========================================================================
-- 9) ai_usage_logs — read USING(true)  →  apenas gestor / coordenador
-- =========================================================================
DROP POLICY IF EXISTS "read logs" ON public.ai_usage_logs;

CREATE POLICY ai_usage_logs_read ON public.ai_usage_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
  );

-- =========================================================================
-- 10) Storage: rma-documents bucket
--     Remove a policy permissiva e cria uma scoped.
-- =========================================================================
DROP POLICY IF EXISTS "auth read rma-documents finals" ON storage.objects;

CREATE POLICY "rma_documents_read_scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rma-documents'
    AND (
      public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.rma_documents d
         WHERE storage.objects.name LIKE '%' || d.rma_id || '%'
           AND public.can_access_rma_doc(d.id)
      )
    )
  );

-- =========================================================================
-- 11) Storage: cobranca-attachments bucket  →  scoped por company
-- =========================================================================
DROP POLICY IF EXISTS "Authenticated can read cobranca attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload cobranca attachments" ON storage.objects;
DROP POLICY IF EXISTS "cobranca_attachments_read" ON storage.objects;
DROP POLICY IF EXISTS "cobranca_attachments_write" ON storage.objects;

CREATE POLICY "cobranca_attachments_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cobranca-attachments'
    AND (
      public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.rma_cobrancas rc
        JOIN public.companies c ON c.rma_id = rc.rma_id
         WHERE storage.objects.name LIKE '%' || rc.rma_id || '%'
           AND public.can_access_company(c.id)
      )
    )
  );

CREATE POLICY "cobranca_attachments_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cobranca-attachments'
    AND (
      public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role)
    )
  );
