
CREATE TABLE IF NOT EXISTS public.reprocess_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id text NOT NULL,
  company_id uuid,
  rma_id text,
  user_id uuid,
  user_role text,
  action text NOT NULL CHECK (action IN ('allowed','blocked')),
  reason text,
  attempt_number integer,
  max_attempts integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reprocess_audit_file ON public.reprocess_audit_log(file_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reprocess_audit_company ON public.reprocess_audit_log(company_id, created_at DESC);

ALTER TABLE public.reprocess_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_gestor_coord_magistrado"
ON public.reprocess_audit_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor_ia'::app_role)
  OR public.has_role(auth.uid(), 'coordenador'::app_role)
  OR public.has_role(auth.uid(), 'magistrado'::app_role)
);

CREATE POLICY "audit_select_consultor_responsavel"
ON public.reprocess_audit_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'consultor'::app_role) AND (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_consultants cc
                WHERE cc.company_id = reprocess_audit_log.company_id
                  AND cc.consultant_user_id = auth.uid())
  )
);

CREATE POLICY "audit_select_recuperanda_released"
ON public.reprocess_audit_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'recuperanda'::app_role)
  AND public.is_company_released_to_user(company_id)
);
