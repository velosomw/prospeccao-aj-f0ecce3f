
-- Habilitar extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Documentos processados pelo pipeline
CREATE TABLE public.pipeline_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  sha256_hash TEXT NOT NULL,
  storage_path TEXT,
  provider TEXT DEFAULT 'upload',
  external_id TEXT,
  pipeline_status TEXT NOT NULL DEFAULT 'pending',
  pipeline_step INTEGER DEFAULT 0,
  ocr_text TEXT,
  ocr_confidence FLOAT,
  ocr_method TEXT,
  document_type TEXT,
  nlp_confidence FLOAT,
  entities JSONB DEFAULT '{}',
  summary TEXT,
  rma_topic INTEGER,
  risk_indicators JSONB DEFAULT '[]',
  language TEXT DEFAULT 'pt-BR',
  page_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(sha256_hash, rma_id)
);

ALTER TABLE public.pipeline_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access pipeline_documents" ON public.pipeline_documents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia') OR has_role(auth.uid(), 'coordenador'))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia') OR has_role(auth.uid(), 'coordenador'));

CREATE POLICY "Consultor read pipeline_documents" ON public.pipeline_documents
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultor'));

CREATE TRIGGER update_pipeline_documents_updated_at
  BEFORE UPDATE ON public.pipeline_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pipeline_docs_rma ON public.pipeline_documents(rma_id);
CREATE INDEX idx_pipeline_docs_status ON public.pipeline_documents(pipeline_status);
CREATE INDEX idx_pipeline_docs_type ON public.pipeline_documents(document_type);
CREATE INDEX idx_pipeline_docs_hash ON public.pipeline_documents(sha256_hash);

-- Logs do pipeline
CREATE TABLE public.pipeline_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.pipeline_documents(id) ON DELETE CASCADE NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  duration_ms INTEGER,
  details JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access pipeline_logs" ON public.pipeline_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia') OR has_role(auth.uid(), 'coordenador'))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia') OR has_role(auth.uid(), 'coordenador'));

CREATE INDEX idx_pipeline_logs_doc ON public.pipeline_logs(document_id);
CREATE INDEX idx_pipeline_logs_step ON public.pipeline_logs(step);

-- Embeddings para busca semântica
CREATE TABLE public.document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.pipeline_documents(id) ON DELETE CASCADE NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  embedding VECTOR(768),
  rma_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access document_embeddings" ON public.document_embeddings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_ia') OR has_role(auth.uid(), 'coordenador'))
  WITH CHECK (has_role(auth.uid(), 'gestor_ia') OR has_role(auth.uid(), 'coordenador'));

CREATE POLICY "Consultor read document_embeddings" ON public.document_embeddings
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'consultor'));

CREATE INDEX idx_embeddings_vector ON public.document_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_embeddings_doc ON public.document_embeddings(document_id);
CREATE INDEX idx_embeddings_rma ON public.document_embeddings(rma_id);

-- Função de busca semântica
CREATE OR REPLACE FUNCTION public.search_documents(
  query_embedding VECTOR(768),
  target_rma_id TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  document_id UUID,
  chunk_text TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    de.document_id,
    de.chunk_text,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM document_embeddings de
  WHERE de.rma_id = target_rma_id
    AND 1 - (de.embedding <=> query_embedding) > match_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Storage bucket para documentos RMA
INSERT INTO storage.buckets (id, name, public) VALUES ('rma-documents', 'rma-documents', false);

CREATE POLICY "Admin upload rma-documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rma-documents' AND (has_role(auth.uid(), 'gestor_ia') OR has_role(auth.uid(), 'coordenador')));

CREATE POLICY "Admin read rma-documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rma-documents' AND (has_role(auth.uid(), 'gestor_ia') OR has_role(auth.uid(), 'coordenador') OR has_role(auth.uid(), 'consultor')));
