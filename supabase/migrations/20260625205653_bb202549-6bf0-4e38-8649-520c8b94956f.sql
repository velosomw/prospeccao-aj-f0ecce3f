
UPDATE public.rma_document_templates
SET structure = jsonb_set(
  structure,
  '{sections}',
  (
    SELECT jsonb_agg(
      CASE
        -- Seção 5: adicionar 5.5 Benefícios
        WHEN s->>'numero' = '5' THEN s || jsonb_build_object(
          'children',
          COALESCE(s->'children','[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('numero','5.5','titulo','Benefícios e demais obrigações trabalhistas','prompt','Vale-transporte, vale-refeição, plano de saúde, demais benefícios.','data_source','folha.beneficios')
          )
        )
        -- Seção 6: adicionar 6.4 Indicadores Patrimoniais
        WHEN s->>'numero' = '6' THEN s || jsonb_build_object(
          'children',
          COALESCE(s->'children','[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('numero','6.4','titulo','Indicadores Patrimoniais','prompt','Endividamento total, imobilização do PL, capital de terceiros.','data_source','bs.indicadores')
          )
        )
        -- Seção 8: adicionar 8.4 Financeiro e 8.5 Demais credores
        WHEN s->>'numero' = '8' THEN s || jsonb_build_object(
          'children',
          COALESCE(s->'children','[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('numero','8.4','titulo','Financeiro','prompt','Bancos, financiamentos e empréstimos pós-RJ.','data_source','divida.financeiro'),
            jsonb_build_object('numero','8.5','titulo','Demais credores extraconcursais','prompt','Outros credores pós-ajuizamento não enquadrados acima.','data_source','divida.outros')
          )
        )
        -- Seção 9: adicionar 9.3 Saldo de Caixa e Equivalentes
        WHEN s->>'numero' = '9' THEN s || jsonb_build_object(
          'children',
          COALESCE(s->'children','[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('numero','9.3','titulo','Saldo de Caixa e Equivalentes','prompt','Saldos bancários, aplicações de curto prazo, conciliação com extratos.','data_source','fluxo.saldo_caixa')
          )
        )
        -- Seção 10: adicionar 10.3 Top fornecedores
        WHEN s->>'numero' = '10' THEN s || jsonb_build_object(
          'children',
          COALESCE(s->'children','[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('numero','10.3','titulo','Top fornecedores e concentração','prompt','Maiores fornecedores por valor e % do total a pagar.','data_source','contas.pagar.top')
          )
        )
        -- Seção 11: adicionar 11.3 Top clientes
        WHEN s->>'numero' = '11' THEN s || jsonb_build_object(
          'children',
          COALESCE(s->'children','[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('numero','11.3','titulo','Top clientes e concentração','prompt','Maiores clientes por valor e % do total a receber.','data_source','contas.receber.top')
          )
        )
        -- Seção 12: adicionar 12.1.1 Faturamento bruto
        WHEN s->>'numero' = '12' THEN jsonb_set(
          s,
          '{children}',
          jsonb_build_array(
            jsonb_set(
              s->'children'->0,
              '{children}',
              jsonb_build_array(
                jsonb_build_object('numero','12.1.1','titulo','Faturamento bruto e líquido','prompt','Receita bruta, deduções, receita líquida; evolução mensal.','data_source','dre.faturamento')
              ) || (s->'children'->0->'children')
            )
          )
        )
        -- Renumeração: 13 (Remuneração AJ) -> 14
        WHEN s->>'numero' = '13' THEN s || jsonb_build_object('numero','14')
        -- Renumeração: 14 (Fatos relevantes) -> 13
        WHEN s->>'numero' = '14' THEN s || jsonb_build_object('numero','13')
        -- Seção 15 (Conclusão Geral): adicionar children oficiais
        WHEN s->>'numero' = '15' THEN s || jsonb_build_object(
          'children',
          jsonb_build_array(
            jsonb_build_object('numero','15.1','titulo','Síntese Patrimonial e Financeira','prompt','Resumo do BP, DRE, fluxo e indicadores.','data_source','conclusao.financeira'),
            jsonb_build_object('numero','15.2','titulo','Síntese de Pendências e Divergências','prompt','Pendências contábeis, fiscais, trabalhistas e operacionais.','data_source','conclusao.pendencias'),
            jsonb_build_object('numero','15.3','titulo','Health Score e Risco Global','prompt','Pontuação BEx-RJ, classificação de risco e recomendações.','data_source','conclusao.score'),
            jsonb_build_object('numero','15.4','titulo','Recomendações ao Juízo','prompt','Recomendações objetivas da Administradora Judicial.','data_source','conclusao.recomendacoes')
          )
        )
        ELSE s
      END
      ORDER BY
        CASE
          WHEN s->>'numero' = '13' THEN 14
          WHEN s->>'numero' = '14' THEN 13
          ELSE (s->>'numero')::int
        END
    )
    FROM jsonb_array_elements(structure->'sections') s
  )
)
WHERE tipo = 'rma_intelligence';
