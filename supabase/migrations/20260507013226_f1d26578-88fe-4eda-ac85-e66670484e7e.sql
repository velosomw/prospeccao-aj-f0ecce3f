-- Permite que a Recuperanda veja os mesmos dados financeiros do Consultor
-- nas abas Processamento e Gráficos, restrito a empresas com release ativa.

CREATE POLICY "Recuperanda visualiza dre_consolidado liberados"
ON public.dre_consolidado FOR SELECT
TO authenticated
USING (public.is_company_released_to_user(company_id));

CREATE POLICY "Recuperanda visualiza balancete_consolidado liberados"
ON public.balancete_consolidado FOR SELECT
TO authenticated
USING (public.is_company_released_to_user(company_id));

CREATE POLICY "Recuperanda visualiza lancamentos liberados"
ON public.lancamentos FOR SELECT
TO authenticated
USING (public.is_company_released_to_user(company_id));