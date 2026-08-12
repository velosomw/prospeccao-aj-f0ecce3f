-- 1. Create Spreadsheet Import Batches table
CREATE TABLE public.spreadsheet_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT null,
    dataset_type text NOT null,
    file_name text NOT null,
    file_size bigint,
    file_hash text,
    status text NOT null DEFAULT 'pending', -- pending, processing, completed, error
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

-- 2. Create Spreadsheet Change Log for Field-Level Lineage
CREATE TABLE public.spreadsheet_change_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id uuid NOT null, -- Refers to the internal record ID (e.g. in prospeccao_linhas)
    batch_id uuid REFERENCES public.spreadsheet_import_batches(id) ON DELETE SET null,
    dataset_type text NOT null,
    field_name text NOT null,
    old_value text,
    new_value text,
    source_type text NOT null, -- SOURCE_EXCEL_UPLOAD, SOURCE_MANUAL_UI, etc.
    source_file text,
    source_row integer,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET null,
    changed_at timestamp with time zone DEFAULT now() NOT null
);

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spreadsheet_import_batches TO authenticated;
GRANT ALL ON public.spreadsheet_import_batches TO service_role;

GRANT SELECT, INSERT ON public.spreadsheet_change_log TO authenticated;
GRANT ALL ON public.spreadsheet_change_log TO service_role;

-- 4. RLS
ALTER TABLE public.spreadsheet_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spreadsheet_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own batches" ON public.spreadsheet_import_batches
    FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view logs for their own records" ON public.spreadsheet_change_log
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.prospeccao_linhas 
            WHERE id = record_id AND user_id = auth.uid()
        )
    );

-- 5. Indexes
CREATE INDEX idx_sib_user ON public.spreadsheet_import_batches(user_id);
CREATE INDEX idx_sib_dataset ON public.spreadsheet_import_batches(dataset_type);
CREATE INDEX idx_scl_record ON public.spreadsheet_change_log(record_id);
CREATE INDEX idx_scl_batch ON public.spreadsheet_change_log(batch_id);

-- 6. Update prospeccao_linhas to support canonical tracking
ALTER TABLE public.prospeccao_linhas 
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'SOURCE_EXCEL_UPLOAD',
ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.spreadsheet_import_batches(id),
ADD COLUMN IF NOT EXISTS data_version integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS field_lineage jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS normalized_processo text,
ADD COLUMN IF NOT EXISTS business_key text;

CREATE INDEX IF NOT EXISTS idx_linhas_normalized_processo ON public.prospeccao_linhas(normalized_processo);
CREATE INDEX IF NOT EXISTS idx_linhas_business_key ON public.prospeccao_linhas(business_key);
