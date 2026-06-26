
CREATE TABLE IF NOT EXISTS public.orchestration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID,
  file_id TEXT,
  rma_id TEXT,
  company_id UUID,
  classe TEXT,
  agentes_executados TEXT[] NOT NULL DEFAULT '{}',
  agente_vencedor TEXT,
  estrategia TEXT NOT NULL DEFAULT 'single',
  evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  resultado_final JSONB,
  score_confianca NUMERIC,
  validado BOOLEAN NOT NULL DEFAULT false,
  motivo TEXT,
  duration_ms INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orchestration_log_document ON public.orchestration_log(document_id);
CREATE INDEX IF NOT EXISTS idx_orchestration_log_company ON public.orchestration_log(company_id);
CREATE INDEX IF NOT EXISTS idx_orchestration_log_created ON public.orchestration_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orchestration_log_classe ON public.orchestration_log(classe);

ALTER TABLE public.orchestration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam orchestration_log"
  ON public.orchestration_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner visualiza orchestration_log"
  ON public.orchestration_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'consultor'::app_role)
    OR (company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = orchestration_log.company_id AND c.created_by = auth.uid()
    ))
    OR (company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.company_consultants cc
      WHERE cc.company_id = orchestration_log.company_id AND cc.consultant_user_id = auth.uid()
    ))
  );
