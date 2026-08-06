-- MD-ENTERPRISE-DOCUMENT-ACQUISITION-AND-REGISTRY-ENGINE-001
-- Implementação do Registro Corporativo de Documentos

CREATE SEQUENCE IF NOT EXISTS public.prospeccao_document_id_seq START 1;

CREATE TABLE IF NOT EXISTS public.prospeccao_document_registry (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id text UNIQUE NOT NULL, -- DOC-YYYYMMDD-XXXXXXXXXX
    hash_sha256 text NOT NULL,
    nome_arquivo text,
    extensao text,
    tamanho_bytes bigint,
    mime_type text DEFAULT 'application/pdf',
    storage_path text NOT NULL,
    url_original text,
    origem text, -- 'Gestor Jurídico', 'OneDrive', etc.
    status text DEFAULT 'certificado',
    versao integer DEFAULT 1,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Permissões
GRANT SELECT, INSERT, UPDATE ON public.prospeccao_document_registry TO authenticated;
GRANT ALL ON public.prospeccao_document_registry TO service_role;

-- RLS
ALTER TABLE public.prospeccao_document_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view registry entries" 
ON public.prospeccao_document_registry FOR SELECT 
TO authenticated 
USING (true);

-- Função para gerar o Document ID Corporativo
CREATE OR REPLACE FUNCTION public.generate_document_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    seq_val bigint;
    doc_id text;
BEGIN
    SELECT nextval('public.prospeccao_document_id_seq') INTO seq_val;
    doc_id := 'DOC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(seq_val::text, 10, '0');
    RETURN doc_id;
END;
$$;

-- Atualizar logs de fetch para referenciar o registry
ALTER TABLE public.prospeccao_document_fetch_logs ADD COLUMN IF NOT EXISTS registry_id uuid REFERENCES public.prospeccao_document_registry(id);
ALTER TABLE public.prospeccao_pdf_jobs ADD COLUMN IF NOT EXISTS registry_id uuid REFERENCES public.prospeccao_document_registry(id);
