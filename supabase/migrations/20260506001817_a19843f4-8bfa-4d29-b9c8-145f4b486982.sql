-- Snapshots completos (header + payload) para rollback de Balancete/BS/DRE
CREATE TABLE IF NOT EXISTS public.balancete_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  versao integer NOT NULL,
  scope text NOT NULL DEFAULT 'mes' CHECK (scope IN ('mes','periodo','full')),
  motivo text,
  origem text DEFAULT 'manual',
  run_id uuid,
  rows_balancete integer NOT NULL DEFAULT 0,
  rows_bs integer NOT NULL DEFAULT 0,
  rows_dre integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_from uuid REFERENCES public.balancete_snapshots(id) ON DELETE SET NULL,
  UNIQUE (company_id, ano, mes, versao)
);

CREATE INDEX IF NOT EXISTS idx_bsn_company_periodo
  ON public.balancete_snapshots (company_id, ano DESC, mes DESC, versao DESC);

ALTER TABLE public.balancete_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bsn_admins_manage"
  ON public.balancete_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'gestor_ia'::app_role)
      OR public.has_role(auth.uid(),'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'gestor_ia'::app_role)
      OR public.has_role(auth.uid(),'coordenador'::app_role));

CREATE POLICY "bsn_read_authorized"
  ON public.balancete_snapshots
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
 OR public.has_role(auth.uid(),'coordenador'::app_role)
 OR public.has_role(auth.uid(),'consultor'::app_role)
 OR EXISTS (SELECT 1 FROM public.companies c
            WHERE c.id = balancete_snapshots.company_id AND c.created_by = auth.uid())
 OR EXISTS (SELECT 1 FROM public.company_consultants cc
            WHERE cc.company_id = balancete_snapshots.company_id
              AND cc.consultant_user_id = auth.uid())
  );