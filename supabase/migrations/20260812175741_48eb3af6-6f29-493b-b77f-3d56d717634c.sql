-- 1) Restrict cross-tenant readable internal tables to staff roles
DROP POLICY IF EXISTS "Autenticados leem account_mapping_cache" ON public.account_mapping_cache;
CREATE POLICY "Staff leem account_mapping_cache" ON public.account_mapping_cache
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role) OR has_role(auth.uid(),'consultor'::app_role));

DROP POLICY IF EXISTS "doc_patterns authenticated read" ON public.document_patterns;
CREATE POLICY "doc_patterns staff read" ON public.document_patterns
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role) OR has_role(auth.uid(),'consultor'::app_role));

DROP POLICY IF EXISTS "Autenticados leem ocr_cache" ON public.ocr_cache;
CREATE POLICY "Staff leem ocr_cache" ON public.ocr_cache
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role) OR has_role(auth.uid(),'consultor'::app_role));

DROP POLICY IF EXISTS "Autenticados visualizam exemplos ativos" ON public.prompt_examples;
CREATE POLICY "Staff visualizam exemplos ativos" ON public.prompt_examples
FOR SELECT TO authenticated
USING (active = true AND (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role) OR has_role(auth.uid(),'consultor'::app_role)));

DROP POLICY IF EXISTS "Autenticados leem prompt_learning ativos" ON public.prompt_learning;
CREATE POLICY "Staff leem prompt_learning ativos" ON public.prompt_learning
FOR SELECT TO authenticated
USING (active = true AND (has_role(auth.uid(),'gestor_ia'::app_role) OR has_role(auth.uid(),'coordenador'::app_role) OR has_role(auth.uid(),'consultor'::app_role)));

-- 2) Revoke anon EXECUTE on all SECURITY DEFINER functions in public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 3) Make views honour the querying user's permissions
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW %s SET (security_invoker = on)', v.rel);
  END LOOP;
END $$;

-- 4) Ensure all SECURITY DEFINER functions have a fixed search_path
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;