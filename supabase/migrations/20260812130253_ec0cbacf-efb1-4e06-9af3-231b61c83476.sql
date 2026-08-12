-- Create Spreadsheet Import Batches table
CREATE TABLE public.spreadsheet_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT null,
    dataset_type text NOT null,
    file_name text NOT null,
    file_size bigint,
    file_hash text,
    status text NOT null DEFAULT 'pending',
    metadata jsonb DEFAULT '{}'::jsonb,
    rows_count integer DEFAULT 0,
    inserted_count integer DEFAULT 0,
    updated_count integer DEFAULT 0,
    unchanged_count integer DEFAULT 0,
    conflict_count integer DEFAULT 0,
    error_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT null,
    updated_at timestamp with time zone DEFAULT now() NOT null
);

-- Create Spreadsheet Change Log for Field-Level Lineage
CREATE TABLE public.spreadsheet_change_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id uuid NOT null,
    batch_id uuid REFERENCES public.spreadsheet_import_batches(id) ON DELETE SET null,
    dataset_type text NOT null,
    field_name text NOT null,
    old_value text,
    new_value text,
    source_type text NOT null,
    source_file text,
    source_row integer,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET null,
    changed_at timestamp with time zone DEFAULT now() NOT null
);

-- Dataset 1: AJ Nomeados e Não Nomeados
CREATE TABLE public.prospeccao_aj_nomeados (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT null,
    import_batch_id uuid REFERENCES public.spreadsheet_import_batches(id),
    data_distribuicao date,
    mes text,
    numero_processo text,
    numero_processo_normalizado text,
    empresa text,
    vara_comarca text,
    estado text,
    valor_passivo numeric,
    aj_nomeado text,
    juiz text,
    business_key text,
    field_lineage jsonb DEFAULT '{}'::jsonb,
    source_type text DEFAULT 'SOURCE_EXCEL_UPLOAD',
    created_at timestamp with time zone DEFAULT now() NOT null,
    updated_at timestamp with time zone DEFAULT now() NOT null
);

-- Dataset 2: AGCs Realizadas
CREATE TABLE public.prospeccao_agcs_realizadas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT null,
    import_batch_id uuid REFERENCES public.spreadsheet_import_batches(id),
    cliente text,
    recuperanda text,
    data_agc date,
    mes text,
    ano integer,
    cidade text,
    estado text,
    business_key text,
    field_lineage jsonb DEFAULT '{}'::jsonb,
    source_type text DEFAULT 'SOURCE_EXCEL_UPLOAD',
    created_at timestamp with time zone DEFAULT now() NOT null,
    updated_at timestamp with time zone DEFAULT now() NOT null
);

-- Dataset 3: Cadastro de Administradores Judiciais
CREATE TABLE public.prospeccao_cadastro_aj (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT null,
    import_batch_id uuid REFERENCES public.spreadsheet_import_batches(id),
    cliente text,
    sigla text,
    contato text,
    endereco text,
    numero text,
    complemento text,
    bairro text,
    cidade text,
    uf text,
    cep text,
    telefone text,
    email text,
    business_key text,
    field_lineage jsonb DEFAULT '{}'::jsonb,
    source_type text DEFAULT 'SOURCE_EXCEL_UPLOAD',
    created_at timestamp with time zone DEFAULT now() NOT null,
    updated_at timestamp with time zone DEFAULT now() NOT null
);

-- Dataset 4: Cartas AJ
CREATE TABLE public.prospeccao_cartas_aj (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT null,
    import_batch_id uuid REFERENCES public.spreadsheet_import_batches(id),
    data_distribuicao date,
    dia integer,
    mes text,
    ano integer,
    cliente text,
    numero_processo text,
    numero_processo_normalizado text,
    data_90_dias date,
    data_120_dias date,
    data_150_dias date,
    sigla text,
    contato text,
    status text,
    data_carta_impressa timestamp with time zone,
    business_key text,
    field_lineage jsonb DEFAULT '{}'::jsonb,
    source_type text DEFAULT 'SOURCE_EXCEL_UPLOAD',
    created_at timestamp with time zone DEFAULT now() NOT null,
    updated_at timestamp with time zone DEFAULT now() NOT null
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spreadsheet_import_batches TO authenticated;
GRANT ALL ON public.spreadsheet_import_batches TO service_role;

GRANT SELECT, INSERT ON public.spreadsheet_change_log TO authenticated;
GRANT ALL ON public.spreadsheet_change_log TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_aj_nomeados TO authenticated;
GRANT ALL ON public.prospeccao_aj_nomeados TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_agcs_realizadas TO authenticated;
GRANT ALL ON public.prospeccao_agcs_realizadas TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_cadastro_aj TO authenticated;
GRANT ALL ON public.prospeccao_cadastro_aj TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospeccao_cartas_aj TO authenticated;
GRANT ALL ON public.prospeccao_cartas_aj TO service_role;

-- RLS
ALTER TABLE public.spreadsheet_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spreadsheet_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccao_aj_nomeados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccao_agcs_realizadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccao_cadastro_aj ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccao_cartas_aj ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own batches" ON public.spreadsheet_import_batches FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view logs" ON public.spreadsheet_change_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own AJ Nomeados" ON public.prospeccao_aj_nomeados FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own AGCs" ON public.prospeccao_agcs_realizadas FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own Cadastro AJ" ON public.prospeccao_cadastro_aj FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own Cartas" ON public.prospeccao_cartas_aj FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_sib_user ON public.spreadsheet_import_batches(user_id);
CREATE INDEX idx_aj_nomeados_key ON public.prospeccao_aj_nomeados(business_key);
CREATE INDEX idx_agcs_key ON public.prospeccao_agcs_realizadas(business_key);
CREATE INDEX idx_cadastro_aj_key ON public.prospeccao_cadastro_aj(business_key);
CREATE INDEX idx_cartas_key ON public.prospeccao_cartas_aj(business_key);