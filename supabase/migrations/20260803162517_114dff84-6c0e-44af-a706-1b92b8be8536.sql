
-- Create database exports system
DO $$ BEGIN
    CREATE TYPE public.export_status AS ENUM ('AVAILABLE', 'OUTDATED', 'GENERATING', 'SUCCESS', 'ERROR', 'NO_DATA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.export_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    name text NOT NULL,
    description text,
    route_key text,
    template_path text,
    output_filename_pattern text,
    source_view text NOT NULL,
    sort_definition jsonb DEFAULT '[]',
    column_definition jsonb DEFAULT '[]',
    format_definition jsonb DEFAULT '{}',
    permission_key text,
    is_active boolean DEFAULT true,
    version integer DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.export_definitions TO authenticated;
GRANT ALL ON public.export_definitions TO service_role;

CREATE TABLE IF NOT EXISTS public.export_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    export_definition_id uuid NOT NULL REFERENCES public.export_definitions(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL REFERENCES auth.users(id),
    status public.export_status NOT NULL DEFAULT 'GENERATING',
    started_at timestamptz DEFAULT now(),
    finished_at timestamptz,
    source_max_updated_at timestamptz,
    record_count integer DEFAULT 0,
    file_name text,
    file_path text,
    file_size_bytes bigint,
    file_hash_sha256 text,
    template_version integer,
    definition_version integer,
    error_code text,
    error_message text,
    filters jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.export_runs TO authenticated;
GRANT ALL ON public.export_runs TO service_role;

CREATE TABLE IF NOT EXISTS public.export_downloads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    export_run_id uuid NOT NULL REFERENCES public.export_runs(id) ON DELETE CASCADE,
    downloaded_by uuid NOT NULL REFERENCES auth.users(id),
    downloaded_at timestamptz DEFAULT now(),
    ip_hash text,
    user_agent text,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.export_downloads TO authenticated;
GRANT ALL ON public.export_downloads TO service_role;

ALTER TABLE public.export_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_downloads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow all authenticated users to read definitions" ON public.export_definitions FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow users to read their own or public runs" ON public.export_runs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow users to create runs" ON public.export_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow users to read their downloads" ON public.export_downloads FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow users to create downloads" ON public.export_downloads FOR INSERT TO authenticated WITH CHECK (auth.uid() = downloaded_by);
EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO public.export_definitions (code, name, description, source_view, column_definition)
VALUES 
('AJ_NOMEADOS', 'Administradores Judiciais Nomeados e Não Nomeados', 'Relatório consolidado de processos e AJs vinculados.', 'vw_export_aj_nomeados', '[
    {"order": 1, "header": "DATA DA DISTRIBUIÇÃO", "source": "data_distribuicao", "type": "date"},
    {"order": 2, "header": "MÊS", "source": "mes_distribuicao", "type": "text"},
    {"order": 3, "header": "Nº PROCESSO", "source": "numero_processo", "type": "text"},
    {"order": 4, "header": "EMPRESA", "source": "empresa", "type": "text"},
    {"order": 5, "header": "VARA E COMARCA", "source": "vara_comarca", "type": "text"},
    {"order": 6, "header": "ESTADO", "source": "uf", "type": "text"},
    {"order": 7, "header": "VALOR DO PASSIVO", "source": "valor_passivo", "type": "currency"},
    {"order": 8, "header": "AJ NOMEADO", "source": "aj_nomeado", "type": "text"},
    {"order": 9, "header": "JUIZ / JUÍZA", "source": "magistrado_nome", "type": "text"}
]'),
('AGCS_REALIZADAS', 'AGCs Realizadas', 'Controle de Assembleias Gerais de Credores concluídas.', 'vw_export_agcs_realizadas', '[
    {"order": 1, "header": "CLIENTE", "source": "cliente", "type": "text"},
    {"order": 2, "header": "RECUPERANDA", "source": "recuperanda", "type": "text"},
    {"order": 3, "header": "DATA AGC", "source": "data_agc", "type": "date"},
    {"order": 4, "header": "MÊS", "source": "mes", "type": "text"},
    {"order": 5, "header": "ANO", "source": "ano", "type": "number"},
    {"order": 6, "header": "Cidade", "source": "cidade", "type": "text"},
    {"order": 7, "header": "Estado", "source": "estado", "type": "text"}
]'),
('CADASTRO_AJ', 'Cadastro de Administradores Judiciais', 'Base completa de contatos e endereços de AJs.', 'vw_export_cadastro_aj', '[
    {"order": 1, "header": "Clientes", "source": "nome", "type": "text"},
    {"order": 2, "header": "Sigla", "source": "sigla", "type": "text"},
    {"order": 3, "header": "Contato", "source": "contato", "type": "text"},
    {"order": 4, "header": "Endereço", "source": "endereco", "type": "text"},
    {"order": 5, "header": "Número", "source": "numero", "type": "text"},
    {"order": 6, "header": "Complemento", "source": "complemento", "type": "text"},
    {"order": 7, "header": "Bairro", "source": "bairro", "type": "text"},
    {"order": 8, "header": "Cidade", "source": "cidade", "type": "text"},
    {"order": 9, "header": "UF", "source": "uf", "type": "text"},
    {"order": 10, "header": "CEP", "source": "cep", "type": "text"},
    {"order": 11, "header": "Telefone", "source": "telefone", "type": "text"},
    {"order": 12, "header": "E-mail", "source": "email", "type": "text"}
]'),
('CARTAS_AJ', 'Relação de Cartas Impressas enviadas aos AJ Parabenizando', 'Log de cartas de parabenização geradas e enviadas.', 'vw_export_cartas_aj', '[
    {"order": 1, "header": "Data da Distribuição", "source": "data_distribuicao", "type": "date"},
    {"order": 2, "header": "Dia", "source": "dia", "type": "number"},
    {"order": 3, "header": "Mês", "source": "mes", "type": "text"},
    {"order": 4, "header": "Ano", "source": "ano", "type": "number"},
    {"order": 5, "header": "Clientes", "source": "cliente", "type": "text"},
    {"order": 6, "header": "Processo", "source": "processo", "type": "text"},
    {"order": 7, "header": "90 DIAS", "source": "dias_90", "type": "date"},
    {"order": 8, "header": "120 DIAS", "source": "dias_120", "type": "date"},
    {"order": 9, "header": "150 DIAS", "source": "dias_150", "type": "date"},
    {"order": 10, "header": "", "source": "sep1", "type": "text"},
    {"order": 11, "header": "Sigla", "source": "sigla", "type": "text"},
    {"order": 12, "header": "Contato", "source": "contato", "type": "text"},
    {"order": 13, "header": "", "source": "sep2", "type": "text"},
    {"order": 14, "header": "STATUS", "source": "status", "type": "text"},
    {"order": 15, "header": "Data Carta Impressa", "source": "data_impressao", "type": "datetime"}
]')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_view = EXCLUDED.source_view,
    column_definition = EXCLUDED.column_definition;
