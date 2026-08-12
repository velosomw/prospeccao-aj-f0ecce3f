-- Migration to fix RLS for prospecting tables to allow service_role and coordination
-- This fixes the "new row violates row-level security policy" error during spreadsheet upload

-- 1. prospeccao_aj_nomeados
DROP POLICY IF EXISTS "Users can manage their own AJ Nomeados" ON public.prospeccao_aj_nomeados;
DROP POLICY IF EXISTS "prospeccao_aj_nomeados_manage_policy" ON public.prospeccao_aj_nomeados;
CREATE POLICY "prospeccao_aj_nomeados_manage_policy" ON public.prospeccao_aj_nomeados
    FOR ALL TO authenticated
    USING (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    )
    WITH CHECK (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    );

-- 2. prospeccao_agcs_realizadas
DROP POLICY IF EXISTS "Users can manage their own AGCs" ON public.prospeccao_agcs_realizadas;
DROP POLICY IF EXISTS "prospeccao_agcs_realizadas_manage_policy" ON public.prospeccao_agcs_realizadas;
CREATE POLICY "prospeccao_agcs_realizadas_manage_policy" ON public.prospeccao_agcs_realizadas
    FOR ALL TO authenticated
    USING (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    )
    WITH CHECK (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    );

-- 3. prospeccao_cadastro_aj
DROP POLICY IF EXISTS "Users can manage their own Cadastro AJ" ON public.prospeccao_cadastro_aj;
DROP POLICY IF EXISTS "prospeccao_cadastro_aj_manage_policy" ON public.prospeccao_cadastro_aj;
CREATE POLICY "prospeccao_cadastro_aj_manage_policy" ON public.prospeccao_cadastro_aj
    FOR ALL TO authenticated
    USING (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    )
    WITH CHECK (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    );

-- 4. prospeccao_cartas_aj
DROP POLICY IF EXISTS "Users can manage their own Cartas" ON public.prospeccao_cartas_aj;
DROP POLICY IF EXISTS "prospeccao_cartas_aj_manage_policy" ON public.prospeccao_cartas_aj;
CREATE POLICY "prospeccao_cartas_aj_manage_policy" ON public.prospeccao_cartas_aj
    FOR ALL TO authenticated
    USING (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    )
    WITH CHECK (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    );

-- 5. spreadsheet_import_batches
DROP POLICY IF EXISTS "Users can manage their own batches" ON public.spreadsheet_import_batches;
DROP POLICY IF EXISTS "spreadsheet_import_batches_manage_policy" ON public.spreadsheet_import_batches;
CREATE POLICY "spreadsheet_import_batches_manage_policy" ON public.spreadsheet_import_batches
    FOR ALL TO authenticated
    USING (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    )
    WITH CHECK (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    );

-- 6. spreadsheet_change_log
DROP POLICY IF EXISTS "Users can view logs" ON public.spreadsheet_change_log;
DROP POLICY IF EXISTS "spreadsheet_change_log_manage_policy" ON public.spreadsheet_change_log;
CREATE POLICY "spreadsheet_change_log_manage_policy" ON public.spreadsheet_change_log
    FOR ALL TO authenticated
    USING (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    )
    WITH CHECK (
        auth.uid() = user_id OR 
        public.has_role(auth.uid(), 'gestor_ia') OR 
        public.has_role(auth.uid(), 'coordenador')
    );

-- Ensure service_role has access
GRANT ALL ON public.prospeccao_aj_nomeados TO service_role;
GRANT ALL ON public.prospeccao_agcs_realizadas TO service_role;
GRANT ALL ON public.prospeccao_cadastro_aj TO service_role;
GRANT ALL ON public.prospeccao_cartas_aj TO service_role;
GRANT ALL ON public.spreadsheet_import_batches TO service_role;
GRANT ALL ON public.spreadsheet_change_log TO service_role;
