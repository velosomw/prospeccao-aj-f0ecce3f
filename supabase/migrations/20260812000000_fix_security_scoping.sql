-- 1. Knowledge Base Scoping (Role-based restriction)
-- Restricted to gestor_ia and coordenador (and service_role).
-- Note: 'authenticated' users (Consultors) can view entities if they have access to a related company, 
-- but generic SELECT is restricted here for security.

DROP POLICY IF EXISTS "knowledge_entities_read" ON public.knowledge_entities;
CREATE POLICY "knowledge_entities_read_scoped" ON public.knowledge_entities
  FOR SELECT TO authenticated 
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador')
  );

DROP POLICY IF EXISTS "knowledge_versions_read" ON public.knowledge_entity_versions;
CREATE POLICY "knowledge_versions_read_scoped" ON public.knowledge_entity_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador')
  );

DROP POLICY IF EXISTS "knowledge_relations_read" ON public.knowledge_relations;
CREATE POLICY "knowledge_relations_read_scoped" ON public.knowledge_relations
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador')
  );

DROP POLICY IF EXISTS "knowledge_events_read" ON public.knowledge_events;
CREATE POLICY "knowledge_events_read_scoped" ON public.knowledge_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador')
  );

DROP POLICY IF EXISTS "knowledge_commercial_read" ON public.knowledge_commercial;
CREATE POLICY "knowledge_commercial_read_scoped" ON public.knowledge_commercial
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador')
  );

DROP POLICY IF EXISTS "knowledge_sources_read" ON public.knowledge_sources;
CREATE POLICY "knowledge_sources_read_scoped" ON public.knowledge_sources
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador')
  );

-- 2. Prospecção Business Facts Scoping
-- Restrict to users who can access the related company via company_consultants.

DROP POLICY IF EXISTS "pbf_read_authenticated" ON public.prospeccao_business_facts;
CREATE POLICY "pbf_read_scoped" ON public.prospeccao_business_facts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador') OR
    EXISTS (
      SELECT 1 FROM public.prospeccao_linhas l
      JOIN public.company_consultants cc ON cc.company_id = l.prospeccao_id -- assuming company_id in cc links to the entity/prospecting ID
      WHERE l.id = prospeccao_business_facts.linha_id
        AND cc.consultant_user_id = auth.uid()
    )
  );

-- 3. Judicial Correspondence (Letters) Scoping
-- Scope by creation ownership or role.

DROP POLICY IF EXISTS "letters_select_authenticated" ON public.letters;
CREATE POLICY "letters_select_scoped" ON public.letters
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador') OR
    created_by = auth.uid()
  );

DROP POLICY IF EXISTS "letters_insert_authenticated" ON public.letters;
CREATE POLICY "letters_insert_scoped" ON public.letters
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador') OR
    created_by = auth.uid()
  );

DROP POLICY IF EXISTS "letters_update_authenticated" ON public.letters;
CREATE POLICY "letters_update_scoped" ON public.letters
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador') OR
    created_by = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador') OR
    created_by = auth.uid()
  );

-- 4. Document Registry Scoping
-- Restrict metadata access to those with company access.

DROP POLICY IF EXISTS "Users can view registry entries" ON public.prospeccao_document_registry;
CREATE POLICY "prospeccao_document_registry_read_scoped" ON public.prospeccao_document_registry
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador') OR
    EXISTS (
      SELECT 1 FROM public.company_consultants cc
      WHERE cc.company_id = prospeccao_document_registry.linha_id -- mapping linha_id to company_id assignment
        AND cc.consultant_user_id = auth.uid()
    )
  );

-- 5. Telemetry & Processing Cost Scoping
-- Restrict to admin roles.

DROP POLICY IF EXISTS "ptel_read_authenticated" ON public.processing_telemetry;
CREATE POLICY "ptel_read_scoped" ON public.processing_telemetry
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador')
  );

-- 6. Analytics Scoping
-- Restrict based on role.

DROP POLICY IF EXISTS "Users can manage their own analytics" ON public.prospeccao_analytics;
CREATE POLICY "prospeccao_analytics_scoped" ON public.prospeccao_analytics
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia') OR 
    public.has_role(auth.uid(), 'coordenador')
  );

-- 7. SECURITY DEFINER search_path fixes
-- Ensuring search_path is set to public to prevent hijacking.

ALTER FUNCTION public.knowledge_upsert_entity(text,text,text,jsonb,jsonb,text,text,text,text,numeric,text) SET search_path = public;
ALTER FUNCTION public.knowledge_search(text,text,integer) SET search_path = public;
ALTER FUNCTION public.knowledge_indicators() SET search_path = public;
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
