-- Implementação MD-GEMINI-DOCUMENT-FETCH-ENGINE-001
-- Criação de infraestrutura para rastreamento de downloads e auditoria de aquisição documental

CREATE TABLE IF NOT EXISTS public.prospeccao_document_fetch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    linha_id UUID REFERENCES public.prospeccao_linhas(id) ON DELETE CASCADE,
    job_id UUID,
    url TEXT NOT NULL,
    status_code INTEGER,
    content_type TEXT,
    file_size INTEGER,
    hash_sha256 TEXT,
    attempts INTEGER DEFAULT 1,
    error_code TEXT,
    tempo_download_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Permissões
GRANT SELECT, INSERT, UPDATE ON public.prospeccao_document_fetch_logs TO authenticated;
GRANT ALL ON public.prospeccao_document_fetch_logs TO service_role;

-- RLS
ALTER TABLE public.prospeccao_document_fetch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own fetch logs"
ON public.prospeccao_document_fetch_logs
FOR SELECT
TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.prospeccao_linhas l
    WHERE l.id = prospeccao_document_fetch_logs.linha_id
    AND l.user_id = auth.uid()
));

-- Adicionar hash na tabela de jobs para cache/duplicidade rápida
ALTER TABLE public.prospeccao_pdf_jobs ADD COLUMN IF NOT EXISTS doc_hash TEXT;
ALTER TABLE public.prospeccao_pdf_jobs ADD COLUMN IF NOT EXISTS fetch_metadata JSONB DEFAULT '{}';
