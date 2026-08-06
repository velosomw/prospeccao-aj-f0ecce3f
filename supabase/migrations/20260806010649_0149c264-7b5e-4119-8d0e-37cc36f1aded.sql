-- Revogar acesso público da função SECURITY DEFINER (MD-001 Parte 13 & 14)
REVOKE ALL ON FUNCTION public.increment_prospeccao_metrics(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_prospeccao_metrics(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_prospeccao_metrics(text, boolean) TO service_role;

-- Fix search_path to prevent security warnings
ALTER FUNCTION public.increment_prospeccao_metrics(text, boolean) SET search_path = public;
