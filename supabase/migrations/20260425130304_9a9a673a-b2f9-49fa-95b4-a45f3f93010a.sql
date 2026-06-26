
-- ===== dataset_validated (ground truth) =====
CREATE TABLE IF NOT EXISTS public.dataset_validated (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES public.ai_extractions(id) ON DELETE SET NULL,
  document_id UUID,
  rma_id TEXT,
  classe TEXT NOT NULL,
  agent TEXT,
  path TEXT,
  input_text TEXT NOT NULL,
  normalized_text TEXT,
  output_original JSONB,
  output_correto JSONB NOT NULL,
  corrections JSONB,
  source TEXT NOT NULL DEFAULT 'human',
  validated_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dataset_validated_classe ON public.dataset_validated(classe);
CREATE INDEX IF NOT EXISTS idx_dataset_validated_extraction ON public.dataset_validated(extraction_id);

ALTER TABLE public.dataset_validated ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam dataset_validated"
ON public.dataset_validated FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador'))
WITH CHECK (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador'));

CREATE POLICY "Consultor visualiza dataset_validated"
ON public.dataset_validated FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'consultor'));

CREATE TRIGGER update_dataset_validated_updated_at
BEFORE UPDATE ON public.dataset_validated
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== prompt_examples =====
CREATE TABLE IF NOT EXISTS public.prompt_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  validated_id UUID REFERENCES public.dataset_validated(id) ON DELETE CASCADE,
  classe TEXT NOT NULL,
  agent TEXT,
  input_text TEXT NOT NULL,
  output_json JSONB NOT NULL,
  embedding extensions.vector(768),
  weight NUMERIC NOT NULL DEFAULT 1.0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_examples_classe ON public.prompt_examples(classe);
CREATE INDEX IF NOT EXISTS idx_prompt_examples_active ON public.prompt_examples(active);
CREATE INDEX IF NOT EXISTS idx_prompt_examples_embedding
  ON public.prompt_examples
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.prompt_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam prompt_examples"
ON public.prompt_examples FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador'))
WITH CHECK (public.has_role(auth.uid(), 'gestor_ia') OR public.has_role(auth.uid(), 'coordenador'));

CREATE POLICY "Autenticados visualizam exemplos ativos"
ON public.prompt_examples FOR SELECT TO authenticated
USING (active = true);

-- ===== Busca por similaridade (search_path inclui extensions) =====
CREATE OR REPLACE FUNCTION public.search_prompt_examples(
  query_embedding extensions.vector,
  target_classe TEXT,
  match_threshold DOUBLE PRECISION DEFAULT 0.7,
  match_count INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  input_text TEXT,
  output_json JSONB,
  similarity DOUBLE PRECISION,
  weight NUMERIC
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    pe.id,
    pe.input_text,
    pe.output_json,
    1 - (pe.embedding <=> query_embedding) AS similarity,
    pe.weight
  FROM public.prompt_examples pe
  WHERE pe.active = true
    AND pe.classe = target_classe
    AND pe.embedding IS NOT NULL
    AND 1 - (pe.embedding <=> query_embedding) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
$$;
