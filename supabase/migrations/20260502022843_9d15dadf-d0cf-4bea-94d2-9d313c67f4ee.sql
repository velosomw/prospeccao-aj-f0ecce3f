
-- 1) Função SECURITY DEFINER para checar acesso por documento (sem recursão)
CREATE OR REPLACE FUNCTION public.can_access_rma_doc(p_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.rma_documents d
      LEFT JOIN public.companies c ON c.rma_id = d.rma_id
     WHERE d.id = p_document_id
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
       )
  );
$$;

-- 2) Trigger BEFORE INSERT: força identidade real (anti-spoof)
CREATE OR REPLACE FUNCTION public.trg_audit_log_enforce_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sempre sobrescreve com a identidade autenticada real
  NEW.user_id   := auth.uid();
  NEW.user_role := public.current_primary_role();
  -- created_at é gerado pelo default; nunca aceita do cliente
  NEW.created_at := now();

  -- Garante action válida
  IF NEW.action IS NULL OR NEW.action NOT IN ('allowed','blocked') THEN
    NEW.action := 'blocked';
  END IF;

  -- Se vier section_id sem document_id, deriva
  IF NEW.document_id IS NULL AND NEW.section_id IS NOT NULL THEN
    SELECT s.document_id INTO NEW.document_id
      FROM public.rma_document_sections s
     WHERE s.id = NEW.section_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rma_audit_log_enforce_identity ON public.rma_section_audit_log;
CREATE TRIGGER rma_audit_log_enforce_identity
  BEFORE INSERT ON public.rma_section_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log_enforce_identity();

-- 3) Refaz as policies com escopo por role
DROP POLICY IF EXISTS "Admins leem audit log"   ON public.rma_section_audit_log;
DROP POLICY IF EXISTS "Sistema grava audit log" ON public.rma_section_audit_log;

-- Leitura: admin total; demais por escopo do documento
CREATE POLICY "audit_log_select_admin"
  ON public.rma_section_audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
  );

CREATE POLICY "audit_log_select_scoped"
  ON public.rma_section_audit_log FOR SELECT TO authenticated
  USING (
    document_id IS NOT NULL
    AND public.can_access_rma_doc(document_id)
  );

-- INSERT: precisa estar autenticado e ter acesso ao documento (ou ser admin)
-- A trigger já força user_id = auth.uid() / user_role real, então não dá pra forjar.
CREATE POLICY "audit_log_insert_authenticated"
  ON public.rma_section_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role)
      OR document_id IS NULL  -- erros pré-resolução de seção
      OR public.can_access_rma_doc(document_id)
    )
  );

-- UPDATE / DELETE: ninguém pode (audit log é WORM)
CREATE POLICY "audit_log_no_update"
  ON public.rma_section_audit_log FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "audit_log_no_delete"
  ON public.rma_section_audit_log FOR DELETE TO authenticated
  USING (false);
