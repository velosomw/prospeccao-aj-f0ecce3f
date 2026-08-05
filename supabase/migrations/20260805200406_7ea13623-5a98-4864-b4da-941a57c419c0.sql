-- MD-GEMINI-EXTRACAO-PROSPECCAO-ADMINISTRADOR-JUDICIAL-001 # PARTE 4
-- Interpretação de Valores e Modelo Único de Dados (Workspace)

CREATE TABLE IF NOT EXISTS public.prospeccao_workspace (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    linha_id uuid REFERENCES public.prospeccao_linhas(id) ON DELETE CASCADE,
    versao integer NOT NULL DEFAULT 1,
    
    -- Modelo Canônico
    numero_processo text,
    empresa_principal text,
    empresas_relacionadas jsonb DEFAULT '[]'::jsonb,
    tipo_processo text,
    fase text,
    vara text,
    comarca text,
    estado text,
    
    -- Valor Unificado para Exportação
    valor_exportacao numeric,
    natureza_valor text,
    
    -- Atores
    administrador_judicial text,
    juiz text,
    
    -- Inteligência e Governança
    alertas jsonb DEFAULT '[]'::jsonb,
    business_facts jsonb DEFAULT '[]'::jsonb,
    evidencias jsonb DEFAULT '[]'::jsonb,
    score_confianca numeric,
    
    raw_response jsonb,
    
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    
    UNIQUE(linha_id, versao)
);

-- Habilitar RLS
ALTER TABLE public.prospeccao_workspace ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.prospeccao_workspace TO authenticated;
GRANT ALL ON public.prospeccao_workspace TO service_role;

-- Policies
CREATE POLICY "Users can view workspace history of their records"
    ON public.prospeccao_workspace
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.prospeccao_linhas l
            WHERE l.id = prospeccao_workspace.linha_id
            AND (l.user_id = auth.uid() OR public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
        )
    );

-- Índices
CREATE INDEX IF NOT EXISTS idx_workspace_linha ON public.prospeccao_workspace(linha_id);
CREATE INDEX IF NOT EXISTS idx_workspace_versao ON public.prospeccao_workspace(linha_id, versao DESC);