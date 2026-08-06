-- Implementação MD-GEMINI-END-TO-END-CERTIFICATION-001
-- Refinamento da estrutura de certificação e logs operacionais

-- Adicionar colunas de certificação detalhada se não existirem
ALTER TABLE public.prospeccao_linhas 
ADD COLUMN IF NOT EXISTS certification_details JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS performance_metrics JSONB DEFAULT '{}';

-- Tabela de Indicadores Operacionais e Comerciais (MD-001 Parte 16 e 17)
CREATE TABLE IF NOT EXISTS public.prospeccao_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE DEFAULT CURRENT_DATE,
    total_processos INTEGER DEFAULT 0,
    total_pdfs INTEGER DEFAULT 0,
    ocr_executados INTEGER DEFAULT 0,
    ocr_falhos INTEGER DEFAULT 0,
    tempo_medio_processamento NUMERIC,
    prioridade_alta INTEGER DEFAULT 0,
    prioridade_media INTEGER DEFAULT 0,
    prioridade_baixa INTEGER DEFAULT 0,
    sem_aj INTEGER DEFAULT 0,
    aj_nomeado INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(metric_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_analytics TO authenticated;
GRANT ALL ON public.prospeccao_analytics TO service_role;

ALTER TABLE public.prospeccao_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own analytics" 
ON public.prospeccao_analytics 
FOR ALL 
TO authenticated 
USING (true);

-- View para facilitar a Certificação da Planilha (MD-001 Parte 7)
CREATE OR REPLACE VIEW public.vw_prospeccao_certification_status AS
SELECT 
    id,
    numero_processo,
    parte_pro_nome as empresa,
    status_certificacao,
    ai_status,
    (certificacao->>'pdf_processado')::boolean as pdf_ok,
    (certificacao->>'json_produzido')::boolean as json_ok,
    (certificacao->>'score_calculado')::boolean as score_ok
FROM public.prospeccao_linhas;

GRANT SELECT ON public.vw_prospeccao_certification_status TO authenticated;
GRANT ALL ON public.vw_prospeccao_certification_status TO service_role;

-- Função para incremento de métricas
CREATE OR REPLACE FUNCTION public.increment_prospeccao_metrics(
    p_prioridade text,
    p_tem_aj boolean
) RETURNS void AS $$
BEGIN
    INSERT INTO public.prospeccao_analytics (
        metric_date,
        total_processos,
        prioridade_alta,
        prioridade_media,
        prioridade_baixa,
        aj_nomeado,
        sem_aj
    ) VALUES (
        CURRENT_DATE,
        1,
        CASE WHEN p_prioridade = 'alta' THEN 1 ELSE 0 END,
        CASE WHEN p_prioridade = 'media' THEN 1 ELSE 0 END,
        CASE WHEN p_prioridade = 'baixa' THEN 1 ELSE 0 END,
        CASE WHEN p_tem_aj THEN 1 ELSE 0 END,
        CASE WHEN NOT p_tem_aj THEN 1 ELSE 0 END
    ) ON CONFLICT (metric_date) DO UPDATE SET
        total_processos = public.prospeccao_analytics.total_processos + 1,
        prioridade_alta = public.prospeccao_analytics.prioridade_alta + CASE WHEN p_prioridade = 'alta' THEN 1 ELSE 0 END,
        prioridade_media = public.prospeccao_analytics.prioridade_media + CASE WHEN p_prioridade = 'media' THEN 1 ELSE 0 END,
        prioridade_baixa = public.prospeccao_analytics.prioridade_baixa + CASE WHEN p_prioridade = 'baixa' THEN 1 ELSE 0 END,
        aj_nomeado = public.prospeccao_analytics.aj_nomeado + CASE WHEN p_tem_aj THEN 1 ELSE 0 END,
        sem_aj = public.prospeccao_analytics.sem_aj + CASE WHEN NOT p_tem_aj THEN 1 ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
