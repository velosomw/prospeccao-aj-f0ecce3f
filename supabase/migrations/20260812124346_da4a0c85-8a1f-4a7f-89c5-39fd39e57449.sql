-- Ajustar definições existentes ou inserir novas com source_view correto
INSERT INTO public.export_definitions (code, name, description, is_active, source_view)
VALUES 
  ('AJ_NOMEADOS', 'Administradores Judiciais Nomeados e Não Nomeados', 'Base consolidada de processos e AJs nomeados com valores de passivo.', true, 'vw_export_aj_nomeados'),
  ('AGCS_REALIZADAS', 'AGCs Realizadas', 'Histórico de Assembleias Gerais de Credores por cliente e recuperanda.', true, 'vw_export_agcs_realizadas'),
  ('CADASTRO_AJ', 'Cadastro de Administradores Judiciais', 'Dados de contato e localização de Administradores Judiciais.', true, 'vw_export_cadastro_aj'),
  ('CARTAS_AJ', 'Relação de Cartas Impressas aos AJ', 'Controle de envio de cartas de parabenização e status de prospecção.', true, 'vw_export_cartas_aj')
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, 
    description = EXCLUDED.description,
    is_active = true,
    source_view = EXCLUDED.source_view;

-- Garantir privilégios
GRANT SELECT ON public.export_definitions TO authenticated;
GRANT ALL ON public.export_definitions TO service_role;
