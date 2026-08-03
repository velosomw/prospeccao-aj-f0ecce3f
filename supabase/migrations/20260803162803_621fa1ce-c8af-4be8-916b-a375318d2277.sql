
-- Create letters table if not exists
CREATE TABLE IF NOT EXISTS public.letters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id uuid NOT NULL,
    aj_id uuid NOT NULL REFERENCES public.profiles(id),
    status text NOT NULL DEFAULT 'PENDENTE',
    printed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.letters TO authenticated;
GRANT ALL ON public.letters TO service_role;

-- 3. Cadastro de Administradores Judiciais
CREATE OR REPLACE VIEW public.vw_export_cadastro_aj AS
SELECT 
    p.id AS source_id,
    p.full_name AS nome,
    p.treatment_sigla AS sigla,
    p.contato_principal AS contato,
    p.endereco,
    p.numero,
    p.complemento,
    p.bairro,
    p.cidade,
    p.uf,
    p.cep,
    p.telefone,
    p.email,
    p.updated_at AS source_updated_at
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ur.role = 'admjudicial';

-- 4. Relação de Cartas Impressas enviadas aos AJ Parabenizando
CREATE OR REPLACE VIEW public.vw_export_cartas_aj AS
SELECT 
    c.id AS source_id,
    l.data_protocolo AS data_distribuicao,
    EXTRACT(DAY FROM l.data_protocolo) AS dia,
    UPPER(CASE EXTRACT(MONTH FROM l.data_protocolo)
        WHEN 1 THEN 'JAN' WHEN 2 THEN 'FEV' WHEN 3 THEN 'MAR' WHEN 4 THEN 'ABR'
        WHEN 5 THEN 'MAI' WHEN 6 THEN 'JUN' WHEN 7 THEN 'JUL' WHEN 8 THEN 'AGO'
        WHEN 9 THEN 'SET' WHEN 10 THEN 'OUT' WHEN 11 THEN 'NOV' WHEN 12 THEN 'DEZ'
    END) AS mes,
    EXTRACT(YEAR FROM l.data_protocolo) AS ano,
    prof.full_name AS cliente,
    l.numero_processo AS processo,
    (l.data_protocolo + interval '90 days')::date AS dias_90,
    (l.data_protocolo + interval '120 days')::date AS dias_120,
    (l.data_protocolo + interval '150 days')::date AS dias_150,
    '' AS sep1,
    prof.treatment_sigla AS sigla,
    prof.contato_principal AS contato,
    '' AS sep2,
    c.status,
    c.printed_at AS data_impressao,
    c.updated_at AS source_updated_at
FROM public.letters c
JOIN public.prospeccao_linhas l ON l.id = c.process_id
JOIN public.profiles prof ON prof.id = c.aj_id;

GRANT SELECT ON public.vw_export_cadastro_aj TO authenticated;
GRANT SELECT ON public.vw_export_cartas_aj TO authenticated;
