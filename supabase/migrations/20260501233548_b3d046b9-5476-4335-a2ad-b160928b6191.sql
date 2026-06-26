REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_ai_cost(text, numeric, numeric, numeric, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_cost_diagnostics() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_file_delta(text, text, text, timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_outliers_by_classe(text, text, numeric) FROM authenticated;