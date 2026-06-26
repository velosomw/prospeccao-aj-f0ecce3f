-- Tabela de embeddings de OCR para busca semântica
CREATE TABLE IF NOT EXISTS public.ocr_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid,
  ocr_result_id uuid,
  rma_id text,
  classe text,
  agent text,
  path text,
  text text NOT NULL,
  normalized_text text,
  embedding extensions.vector(768),
  source text NOT NULL DEFAULT 'pipeline',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ocr_embeddings_classe_idx ON public.ocr_embeddings(classe);
CREATE INDEX IF NOT EXISTS ocr_embeddings_rma_idx ON public.ocr_embeddings(rma_id);
CREATE INDEX IF NOT EXISTS ocr_embeddings_vec_idx
  ON public.ocr_embeddings USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.ocr_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam ocr_embeddings"
  ON public.ocr_embeddings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia'::app_role) OR has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor visualiza ocr_embeddings"
  ON public.ocr_embeddings FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultor'::app_role));

-- Busca por similaridade (cosine distance)
CREATE OR REPLACE FUNCTION public.search_ocr_embeddings(
  query_embedding extensions.vector,
  target_classe text DEFAULT NULL,
  target_rma_id text DEFAULT NULL,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  rma_id text,
  classe text,
  text text,
  similarity double precision
)
LANGUAGE sql STABLE SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    oe.id,
    oe.document_id,
    oe.rma_id,
    oe.classe,
    oe.text,
    1 - (oe.embedding <=> query_embedding) AS similarity
  FROM public.ocr_embeddings oe
  WHERE oe.embedding IS NOT NULL
    AND (target_classe IS NULL OR oe.classe = target_classe)
    AND (target_rma_id IS NULL OR oe.rma_id = target_rma_id)
    AND 1 - (oe.embedding <=> query_embedding) > match_threshold
  ORDER BY oe.embedding <=> query_embedding
  LIMIT match_count;
$$;