
-- 1. control_* tables: remove anonymous/public access
DROP POLICY IF EXISTS "public read history" ON public.control_card_history;
DROP POLICY IF EXISTS "public write history" ON public.control_card_history;
DROP POLICY IF EXISTS "public read cards" ON public.control_cards;
DROP POLICY IF EXISTS "public write cards" ON public.control_cards;
DROP POLICY IF EXISTS "public update cards" ON public.control_cards;
DROP POLICY IF EXISTS "public delete cards" ON public.control_cards;
DROP POLICY IF EXISTS "public read folders" ON public.control_folders;
DROP POLICY IF EXISTS "public write folders" ON public.control_folders;
DROP POLICY IF EXISTS "public update folders" ON public.control_folders;
DROP POLICY IF EXISTS "public delete folders" ON public.control_folders;
DROP POLICY IF EXISTS "public read control users" ON public.control_users;

REVOKE ALL ON public.control_card_history FROM anon;
REVOKE ALL ON public.control_cards FROM anon;
REVOKE ALL ON public.control_folders FROM anon;
REVOKE ALL ON public.control_users FROM anon;

CREATE POLICY "control_history_read_auth" ON public.control_card_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "control_history_write_staff" ON public.control_card_history
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role)
    OR public.has_role(auth.uid(),'consultor'::app_role));

CREATE POLICY "control_cards_read_auth" ON public.control_cards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "control_cards_manage_staff" ON public.control_cards
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role)
    OR public.has_role(auth.uid(),'consultor'::app_role))
  WITH CHECK (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role)
    OR public.has_role(auth.uid(),'consultor'::app_role));

CREATE POLICY "control_folders_read_auth" ON public.control_folders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "control_folders_manage_staff" ON public.control_folders
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role)
    OR public.has_role(auth.uid(),'consultor'::app_role))
  WITH CHECK (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role)
    OR public.has_role(auth.uid(),'consultor'::app_role));

CREATE POLICY "control_users_read_auth" ON public.control_users
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "control_users_manage_staff" ON public.control_users
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role));

-- 2. rma_section_evidences: scope to document access
DROP POLICY IF EXISTS "Authenticated read evidences" ON public.rma_section_evidences;
DROP POLICY IF EXISTS "Authenticated write evidences" ON public.rma_section_evidences;
DROP POLICY IF EXISTS "Authenticated update evidences" ON public.rma_section_evidences;
DROP POLICY IF EXISTS "Authenticated delete evidences" ON public.rma_section_evidences;

CREATE POLICY "evidences_read_scoped" ON public.rma_section_evidences
  FOR SELECT TO authenticated USING (
    (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
    OR EXISTS (SELECT 1 FROM public.rma_document_sections s
                WHERE s.id = rma_section_evidences.section_id
                  AND public.can_access_rma_doc(s.document_id)));
CREATE POLICY "evidences_write_scoped" ON public.rma_section_evidences
  FOR INSERT TO authenticated WITH CHECK (
    (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
    OR EXISTS (SELECT 1 FROM public.rma_document_sections s
                WHERE s.id = rma_section_evidences.section_id
                  AND public.can_access_rma_doc(s.document_id)));
CREATE POLICY "evidences_update_scoped" ON public.rma_section_evidences
  FOR UPDATE TO authenticated USING (
    (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
    OR EXISTS (SELECT 1 FROM public.rma_document_sections s
                WHERE s.id = rma_section_evidences.section_id
                  AND public.can_access_rma_doc(s.document_id)))
  WITH CHECK (
    (document_id IS NOT NULL AND public.can_access_rma_doc(document_id))
    OR EXISTS (SELECT 1 FROM public.rma_document_sections s
                WHERE s.id = rma_section_evidences.section_id
                  AND public.can_access_rma_doc(s.document_id)));
CREATE POLICY "evidences_delete_staff" ON public.rma_section_evidences
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role));

-- 3. Storage: exact folder ownership instead of LIKE matching
DROP POLICY IF EXISTS "rma_documents_read_scoped" ON storage.objects;
CREATE POLICY "rma_documents_read_scoped" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'rma-documents'
    AND (
      public.has_role(auth.uid(),'gestor_ia'::app_role)
      OR public.has_role(auth.uid(),'coordenador'::app_role)
      OR EXISTS (SELECT 1 FROM public.rma_documents d
                  WHERE (storage.foldername(objects.name))[1] = d.rma_id
                    AND public.can_access_rma_doc(d.id))));

DROP POLICY IF EXISTS "cobranca_attachments_read" ON storage.objects;
CREATE POLICY "cobranca_attachments_read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'cobranca-attachments'
    AND (
      public.has_role(auth.uid(),'gestor_ia'::app_role)
      OR public.has_role(auth.uid(),'coordenador'::app_role)
      OR EXISTS (SELECT 1 FROM public.rma_cobrancas rc
                  JOIN public.companies c ON c.rma_id = rc.rma_id
                  WHERE (storage.foldername(objects.name))[1] = rc.rma_id
                    AND public.can_access_company(c.id))));

-- 4. Lock down SECURITY DEFINER / internal routines from anon & authenticated
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Predicate helpers required by RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_company(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_company_by_rma(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_rma_doc(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_company_released_to_user(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admjudicial_for_recuperanda(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_primary_role() TO authenticated;

-- RPCs legitimately invoked by the signed-in app (authorization enforced inside)
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_jobs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consolidate_rma_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correlate_processed_files(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_notifications_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_failed_job(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_rma_document_recuperanda_release(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_worker_mode(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_rma_section_status(uuid, text, text) TO authenticated;
