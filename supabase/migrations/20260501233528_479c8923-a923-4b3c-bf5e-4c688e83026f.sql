-- 1) View ai_cost_summary como SECURITY INVOKER
ALTER VIEW IF EXISTS public.ai_cost_summary SET (security_invoker = true);

-- 2) REVOKE EXECUTE em SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_enqueue_processing() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_version_document() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_calculate_cost() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.calculate_ai_cost(text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_ai_cost(text, numeric, numeric, numeric, numeric) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.ai_cost_diagnostics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_cost_diagnostics() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.detect_file_delta(text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_file_delta(text, text, text, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.detect_outliers_by_classe(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_outliers_by_classe(text, text, numeric) TO authenticated, service_role;

-- 3) Política de insert em ai_usage_logs
DROP POLICY IF EXISTS "insert logs" ON public.ai_usage_logs;
CREATE POLICY "insert logs"
  ON public.ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4) pg_net: drop do public e recreate em extensions
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;