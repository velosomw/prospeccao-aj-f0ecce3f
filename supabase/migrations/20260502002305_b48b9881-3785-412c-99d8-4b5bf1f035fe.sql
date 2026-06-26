-- ===== 1) agent_profiles =====
CREATE TABLE IF NOT EXISTS public.agent_profiles (
  agent_name             text PRIMARY KEY,
  temperature            numeric NOT NULL DEFAULT 0.2,
  max_tokens             integer NOT NULL DEFAULT 2000,
  similarity_threshold   numeric NOT NULL DEFAULT 0.7,
  max_examples           integer NOT NULL DEFAULT 5,
  use_structured_context boolean NOT NULL DEFAULT false,
  use_path_context       boolean NOT NULL DEFAULT true,
  strict_mode            boolean NOT NULL DEFAULT true,
  require_validation     boolean NOT NULL DEFAULT true,
  priority_model         text    NOT NULL DEFAULT 'flash-lite',
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem agent_profiles" ON public.agent_profiles;
CREATE POLICY "Autenticados leem agent_profiles"
  ON public.agent_profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins gerenciam agent_profiles" ON public.agent_profiles;
CREATE POLICY "Admins gerenciam agent_profiles"
  ON public.agent_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE TRIGGER agent_profiles_set_updated_at
  BEFORE UPDATE ON public.agent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed perfis (idempotente)
INSERT INTO public.agent_profiles
  (agent_name, similarity_threshold, max_examples, strict_mode, priority_model, use_structured_context)
VALUES
  ('AGENTE_PIX',                0.75, 3, true,  'flash-lite', false),
  ('AGENTE_BOLETO',             0.72, 3, true,  'flash-lite', false),
  ('AGENTE_COMPROVANTE',        0.70, 4, true,  'flash-lite', false),
  ('AGENTE_BALANCETE',          0.60, 8, true,  'pro',        true),
  ('AGENTE_EXTRATOS_BANCARIOS', 0.65, 6, true,  'pro',        true),
  ('AGENTE_DRE',                0.62, 7, true,  'pro',        true),
  ('AGENTE_FLUXO_CAIXA',        0.62, 7, true,  'pro',        true),
  ('AGENTE_NOTA_FISCAL',        0.70, 5, true,  'flash-lite', true),
  ('AGENTE_CONTRATO',           0.68, 4, true,  'pro',        false),
  ('AGENTE_FOLHA_PAGAMENTO',    0.65, 6, true,  'pro',        true),
  ('AGENTE_IMPOSTOS',           0.68, 5, true,  'pro',        true),
  ('AGENTE_RELATORIO_GERENCIAL',0.65, 6, false, 'pro',        true),
  ('AGENTE_GENERICO',           0.80, 2, false, 'flash-lite', false)
ON CONFLICT (agent_name) DO NOTHING;

-- ===== 2) company_context =====
CREATE TABLE IF NOT EXISTS public.company_context (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  rma_id      text,
  chave       text NOT NULL,
  valor       text NOT NULL,
  scope       text NOT NULL DEFAULT 'general', -- general | financial | legal | personas | accounts
  weight      numeric NOT NULL DEFAULT 1.0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_company_context_company ON public.company_context (company_id);
CREATE INDEX IF NOT EXISTS idx_company_context_scope   ON public.company_context (company_id, scope);

ALTER TABLE public.company_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam company_context" ON public.company_context;
CREATE POLICY "Admins gerenciam company_context"
  ON public.company_context FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

DROP POLICY IF EXISTS "Consultor/owner lê company_context" ON public.company_context;
CREATE POLICY "Consultor/owner lê company_context"
  ON public.company_context FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM public.companies c
               WHERE c.id = company_context.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_consultants cc
               WHERE cc.company_id = company_context.company_id AND cc.consultant_user_id = auth.uid())
  );

CREATE TRIGGER company_context_set_updated_at
  BEFORE UPDATE ON public.company_context
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 3) Auto-degradação do perfil em caso de erro recorrente =====
CREATE OR REPLACE FUNCTION public.degrade_agent_profile_on_error(
  p_agent_name text,
  p_step numeric DEFAULT 0.05,
  p_extra_examples integer DEFAULT 2
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.agent_profiles;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor_ia'::app_role)
          OR public.has_role(auth.uid(), 'coordenador'::app_role)) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  UPDATE public.agent_profiles
     SET similarity_threshold = GREATEST(0.40, similarity_threshold - p_step),
         max_examples         = LEAST(15, max_examples + p_extra_examples),
         updated_at           = now()
   WHERE agent_name = p_agent_name
   RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent_profile % não existe', p_agent_name;
  END IF;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.degrade_agent_profile_on_error(text, numeric, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.degrade_agent_profile_on_error(text, numeric, integer) TO authenticated;