
-- Add missing columns to profiles if they don't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS treatment_sigla text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contato_principal text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS numero text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS uf text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone text;

-- Re-create Views for Export based on existing tables
CREATE OR REPLACE VIEW public.vw_export_aj_nomeados AS
SELECT 
    l.id AS source_id,
    l.data_protocolo AS data_distribuicao,
    UPPER(CASE EXTRACT(MONTH FROM l.data_protocolo)
        WHEN 1 THEN 'JAN' WHEN 2 THEN 'FEV' WHEN 3 THEN 'MAR' WHEN 4 THEN 'ABR'
        WHEN 5 THEN 'MAI' WHEN 6 THEN 'JUN' WHEN 7 THEN 'JUL' WHEN 8 THEN 'AGO'
        WHEN 9 THEN 'SET' WHEN 10 THEN 'OUT' WHEN 11 THEN 'NOV' WHEN 12 THEN 'DEZ'
    END) AS mes_distribuicao,
    l.numero_processo,
    l.parte_pro_nome AS empresa,
    l.orgao_tribunal AS vara_comarca,
    l.uf,
    l.valor_pleito AS valor_passivo,
    p.full_name AS aj_nomeado,
    null::text AS magistrado_nome,
    l.updated_at AS source_updated_at
FROM public.prospeccao_linhas l
LEFT JOIN public.profiles p ON p.id = l.user_id;

CREATE OR REPLACE VIEW public.vw_export_agcs_realizadas AS
SELECT 
    l.id AS source_id,
    p.full_name AS cliente,
    l.parte_pro_nome AS recuperanda,
    l.data_protocolo AS data_agc, 
    UPPER(CASE EXTRACT(MONTH FROM l.data_protocolo)
        WHEN 1 THEN 'JAN' WHEN 2 THEN 'FEV' WHEN 3 THEN 'MAR' WHEN 4 THEN 'ABR'
        WHEN 5 THEN 'MAI' WHEN 6 THEN 'JUN' WHEN 7 THEN 'JUL' WHEN 8 THEN 'AGO'
        WHEN 9 THEN 'SET' WHEN 10 THEN 'OUT' WHEN 11 THEN 'NOV' WHEN 12 THEN 'DEZ'
    END) AS mes,
    EXTRACT(YEAR FROM l.data_protocolo) AS ano,
    l.municipio AS cidade,
    l.uf AS estado,
    l.updated_at AS source_updated_at
FROM public.prospeccao_linhas l
LEFT JOIN public.profiles p ON p.id = l.user_id;

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

CREATE OR REPLACE VIEW public.vw_export_cartas_aj AS
SELECT 
    l.id AS source_id,
    l.data_protocolo AS data_distribuicao,
    EXTRACT(DAY FROM l.data_protocolo) AS dia,
    UPPER(CASE EXTRACT(MONTH FROM l.data_protocolo)
        WHEN 1 THEN 'JAN' WHEN 2 THEN 'FEV' WHEN 3 THEN 'MAR' WHEN 4 THEN 'ABR'
        WHEN 5 THEN 'MAI' WHEN 6 THEN 'JUN' WHEN 7 THEN 'JUL' WHEN 8 THEN 'AGO'
        WHEN 9 THEN 'SET' WHEN 10 THEN 'OUT' WHEN 11 THEN 'NOV' WHEN 12 THEN 'DEZ'
    END) AS mes,
    EXTRACT(YEAR FROM l.data_protocolo) AS ano,
    p.full_name AS cliente,
    l.numero_processo AS processo,
    (l.data_protocolo + interval '90 days')::date AS dias_90,
    (l.data_protocolo + interval '120 days')::date AS dias_120,
    (l.data_protocolo + interval '150 days')::date AS dias_150,
    '' AS sep1,
    p.treatment_sigla AS sigla,
    p.contato_principal AS contato,
    '' AS sep2,
    'ENVIADA'::text AS status,
    l.created_at AS data_impressao,
    l.updated_at AS source_updated_at
FROM public.prospeccao_linhas l
LEFT JOIN public.profiles p ON p.id = l.user_id;

-- Grants for views
GRANT SELECT ON public.vw_export_aj_nomeados TO authenticated;
GRANT SELECT ON public.vw_export_agcs_realizadas TO authenticated;
GRANT SELECT ON public.vw_export_cadastro_aj TO authenticated;
GRANT SELECT ON public.vw_export_cartas_aj TO authenticated;
