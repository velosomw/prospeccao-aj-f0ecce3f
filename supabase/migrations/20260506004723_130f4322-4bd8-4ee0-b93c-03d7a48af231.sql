-- Phase 8: Monthly RMA snapshot capturing Balancete + BS + DRE + KPIs/Alerts
CREATE TABLE IF NOT EXISTS public.rma_monthly_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  rma_id TEXT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  motivo TEXT,
  origem TEXT NOT NULL DEFAULT 'manual',
  rows_balancete INTEGER NOT NULL DEFAULT 0,
  rows_bs INTEGER NOT NULL DEFAULT 0,
  rows_dre INTEGER NOT NULL DEFAULT 0,
  alerts_count INTEGER NOT NULL DEFAULT 0,
  percentual INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  resumo JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rma_monthly_snapshots_company_period
  ON public.rma_monthly_snapshots (company_id, ano DESC, mes DESC, versao DESC);

ALTER TABLE public.rma_monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestor/Coord/Consultor can view snapshots"
  ON public.rma_monthly_snapshots FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role)
    OR public.has_role(auth.uid(), 'consultor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_id
        AND (c.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.company_consultants cc
                     WHERE cc.company_id = c.id AND cc.consultant_user_id = auth.uid()))
    )
  );

CREATE POLICY "Authenticated can insert snapshots via function"
  ON public.rma_monthly_snapshots FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE TRIGGER trg_rma_monthly_snapshots_updated_at
  BEFORE UPDATE ON public.rma_monthly_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();