-- Memória Semântica por Empresa (v1)

-- 1. Memória semântica vetorial
CREATE TABLE IF NOT EXISTS public.company_memory_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  tipo text NOT NULL DEFAULT 'contexto_documento', -- contexto_documento | regra | padrao | comportamento | erro
  conteudo text NOT NULL,
  embedding extensions.vector(768),
  weight numeric NOT NULL DEFAULT 1.0,
  source text,
  document_id uuid,
  extraction_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_memory_emb_company ON public.company_memory_embeddings(company_id);
CREATE INDEX IF NOT EXISTS idx_company_memory_emb_tipo ON public.company_memory_embeddings(tipo);
CREATE INDEX IF NOT EXISTS idx_company_memory_emb_vec ON public.company_memory_embeddings
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.company_memory_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam company_memory_embeddings"
  ON public.company_memory_embeddings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner lê company_memory_embeddings"
  ON public.company_memory_embeddings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_memory_embeddings.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_consultants cc WHERE cc.company_id = company_memory_embeddings.company_id AND cc.consultant_user_id = auth.uid())
  );

-- 2. Regras de negócio por empresa
CREATE TABLE IF NOT EXISTS public.company_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  rma_id text,
  tipo text NOT NULL DEFAULT 'geral', -- geral | classificacao | conta | fornecedor | banco
  regra text NOT NULL,
  prioridade integer NOT NULL DEFAULT 5,
  ativa boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_rules_company ON public.company_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_company_rules_active ON public.company_rules(company_id, ativa) WHERE ativa = true;

ALTER TABLE public.company_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam company_rules"
  ON public.company_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner lê company_rules"
  ON public.company_rules FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'consultor'::app_role)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_rules.company_id AND c.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.company_consultants cc WHERE cc.company_id = company_rules.company_id AND cc.consultant_user_id = auth.uid())
  );

CREATE TRIGGER trg_company_rules_updated_at
  BEFORE UPDATE ON public.company_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Função de busca por similaridade
CREATE OR REPLACE FUNCTION public.match_company_memory(
  query_embedding extensions.vector,
  target_company_id uuid,
  match_threshold double precision DEFAULT 0.65,
  match_count integer DEFAULT 5
)
RETURNS TABLE (id uuid, tipo text, conteudo text, similarity double precision, weight numeric)
LANGUAGE sql STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    cm.id, cm.tipo, cm.conteudo,
    1 - (cm.embedding <=> query_embedding) AS similarity,
    cm.weight
  FROM public.company_memory_embeddings cm
  WHERE cm.company_id = target_company_id
    AND cm.embedding IS NOT NULL
    AND 1 - (cm.embedding <=> query_embedding) > match_threshold
  ORDER BY ((1 - (cm.embedding <=> query_embedding)) * cm.weight) DESC
  LIMIT match_count;
$$;

-- 4. Reforço de peso (success/failure) para memórias usadas
CREATE OR REPLACE FUNCTION public.reinforce_company_memory(
  p_memory_id uuid, p_success boolean
)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  delta numeric := CASE WHEN p_success THEN 0.1 ELSE -0.15 END;
  new_w numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'gestor_ia'::app_role)
          OR public.has_role(auth.uid(), 'coordenador'::app_role)) THEN
    RAISE EXCEPTION 'Permissão negada';
  END IF;

  UPDATE public.company_memory_embeddings
     SET weight = LEAST(5.0, GREATEST(0.1, weight + delta))
   WHERE id = p_memory_id
   RETURNING weight INTO new_w;

  RETURN new_w;
END;
$$;