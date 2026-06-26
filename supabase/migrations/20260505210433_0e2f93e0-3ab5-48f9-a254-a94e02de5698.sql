
CREATE TABLE IF NOT EXISTS public.bs_consolidado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  secao text NOT NULL CHECK (secao IN ('ativo','passivo','pl')),
  grupo text CHECK (grupo IN ('circulante','nao_circulante','patrimonio_liquido')),
  codigo text NOT NULL,
  descricao text NOT NULL,
  nivel integer NOT NULL DEFAULT 1,
  valor numeric NOT NULL DEFAULT 0,
  av_pct numeric,
  ah_pct numeric,
  fonte text DEFAULT 'derivado',
  hash_doc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bs_consolidado_unq UNIQUE (company_id, ano, mes, codigo, secao)
);
CREATE INDEX IF NOT EXISTS idx_bs_consolidado_company_periodo
  ON public.bs_consolidado (company_id, ano DESC, mes DESC);
CREATE INDEX IF NOT EXISTS idx_bs_consolidado_secao
  ON public.bs_consolidado (company_id, secao, ano, mes);

ALTER TABLE public.bs_consolidado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bs_read_authorized"
  ON public.bs_consolidado FOR SELECT
  USING (
    public.has_role(auth.uid(),'gestor_ia'::app_role)
    OR public.has_role(auth.uid(),'coordenador'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.companies c
       WHERE c.id = bs_consolidado.company_id
         AND (c.created_by = auth.uid()
              OR EXISTS (SELECT 1 FROM public.company_consultants cc
                          WHERE cc.company_id = c.id AND cc.consultant_user_id = auth.uid()))
    )
    OR EXISTS (
      SELECT 1 FROM public.rma_release_assignments r
       WHERE r.company_id = bs_consolidado.company_id
         AND r.released_to_user_id = auth.uid()
         AND r.status = 'active'
    )
  );

CREATE POLICY "bs_insert_gestor_coord"
  ON public.bs_consolidado FOR INSERT
  WITH CHECK (public.has_role(auth.uid(),'gestor_ia'::app_role)
              OR public.has_role(auth.uid(),'coordenador'::app_role));

CREATE POLICY "bs_update_gestor_coord"
  ON public.bs_consolidado FOR UPDATE
  USING (public.has_role(auth.uid(),'gestor_ia'::app_role)
         OR public.has_role(auth.uid(),'coordenador'::app_role));

CREATE POLICY "bs_delete_gestor"
  ON public.bs_consolidado FOR DELETE
  USING (public.has_role(auth.uid(),'gestor_ia'::app_role));

CREATE TRIGGER trg_bs_consolidado_updated
  BEFORE UPDATE ON public.bs_consolidado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
