ALTER VIEW public.vw_training_pending SET (security_invoker = on);
GRANT SELECT ON public.vw_training_pending TO authenticated;
GRANT SELECT ON public.vw_training_pending TO service_role;