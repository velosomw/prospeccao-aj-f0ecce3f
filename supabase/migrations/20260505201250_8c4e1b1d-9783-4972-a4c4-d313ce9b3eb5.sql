
ALTER TABLE public.rma_document_sections
  ADD COLUMN IF NOT EXISTS kpis           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS graficos_ids   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dados_origem   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS chart_meta     jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.rma_document_charts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES public.rma_documents(id) ON DELETE CASCADE,
  section_id    uuid REFERENCES public.rma_document_sections(id) ON DELETE SET NULL,
  tipo          text NOT NULL CHECK (tipo IN ('linha','barra','pizza','area','tabela')),
  titulo        text NOT NULL,
  dados         jsonb NOT NULL DEFAULT '{}'::jsonb,
  descricao_ia  text,
  fonte         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rma_doc_charts_doc     ON public.rma_document_charts(document_id);
CREATE INDEX IF NOT EXISTS idx_rma_doc_charts_section ON public.rma_document_charts(section_id);

ALTER TABLE public.rma_document_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Charts visibility follows document" ON public.rma_document_charts;
CREATE POLICY "Charts visibility follows document"
  ON public.rma_document_charts FOR SELECT
  USING (public.can_access_rma_doc(document_id));

DROP POLICY IF EXISTS "Coordenador/Gestor manage charts" ON public.rma_document_charts;
CREATE POLICY "Coordenador/Gestor manage charts"
  ON public.rma_document_charts FOR ALL
  USING (public.has_role(auth.uid(),'coordenador'::app_role) OR public.has_role(auth.uid(),'gestor_ia'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'coordenador'::app_role) OR public.has_role(auth.uid(),'gestor_ia'::app_role));

DROP TRIGGER IF EXISTS trg_rma_doc_charts_updated ON public.rma_document_charts;
CREATE TRIGGER trg_rma_doc_charts_updated
  BEFORE UPDATE ON public.rma_document_charts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.rma_document_bump_version(p_document_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_v integer;
BEGIN
  UPDATE public.rma_documents
     SET arquivo_final_versao = COALESCE(arquivo_final_versao, 0) + 1,
         arquivo_final_gerado_em = now(),
         updated_at = now()
   WHERE id = p_document_id
   RETURNING arquivo_final_versao INTO next_v;
  RETURN COALESCE(next_v, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_rma_section_autosync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_ok    int;
  v_pct   int;
  v_doc   uuid := COALESCE(NEW.document_id, OLD.document_id);
  v_new_status text;
BEGIN
  IF v_doc IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status IN ('aprovado','concluido'))
    INTO v_total, v_ok
    FROM public.rma_document_sections
   WHERE document_id = v_doc;
  v_pct := CASE WHEN v_total = 0 THEN 0 ELSE ROUND(100.0 * v_ok / v_total)::int END;
  v_new_status := CASE
    WHEN v_pct >= 100 THEN 'finalizado'
    WHEN v_pct >= 70  THEN 'pre_parecer'
    WHEN v_pct >  0   THEN 'em_producao'
    ELSE 'rascunho'
  END;
  UPDATE public.rma_documents
     SET progresso = v_pct,
         arquivo_final_pct = v_pct,
         status = CASE
                    WHEN status = 'finalizado' AND v_new_status <> 'finalizado'
                      THEN 'pre_parecer'
                    ELSE v_new_status
                  END,
         updated_at = now()
   WHERE id = v_doc;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rma_section_autosync ON public.rma_document_sections;
CREATE TRIGGER trg_rma_section_autosync
  AFTER INSERT OR UPDATE OF status, conteudo_editado, conteudo_ia OR DELETE
  ON public.rma_document_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_rma_section_autosync();

UPDATE public.rma_document_templates
   SET nome = 'Revisão-Relatório RMA Mensal (CNJ 72/2020)',
       descricao = 'Relatório mensal de atividade de Administração Judicial — modelo BEx híbrido (CNJ 72/2020 + indicadores e diagnósticos automáticos)',
       structure = '[
  {"numero":"0","titulo":"Considerações Iniciais","prompt":"Considerações iniciais sobre escopo do RMA, recomendação CNJ 72/2020, fontes de informação e período analisado.","chart_meta":[]},
  {"numero":"0.1","titulo":"Introdução e Metodologia","prompt":"Apresente: (a) objetivo do relatório, (b) contexto da análise da Recuperanda, (c) metodologia aplicada pela IA (Auditor Contábil Sênior IA + agentes especializados), (d) base documental utilizada (balancetes, contratos, folhas).","chart_meta":[]},
  {"numero":"1","titulo":"Alteração da Atividade Empresarial","prompt":"Houve alteração da atividade empresarial no período? Documentar com evidências (CNAE, contratos sociais).","chart_meta":[]},
  {"numero":"2","titulo":"Alteração da Estrutura Societária e Órgãos de Administração","prompt":"Composição acionária e direção atualizadas? Mudanças no período? Cite documentos de origem.","chart_meta":[]},
  {"numero":"3","titulo":"Abertura ou Fechamento de Estabelecimentos","prompt":"Houve abertura/fechamento de filiais ou alteração de endereços? Liste com datas.","chart_meta":[]},
  {"numero":"4","titulo":"Segmento de Atuação","prompt":"Segmento, fontes de informação, associações e sindicatos vinculados.","chart_meta":[]},
  {"numero":"5","titulo":"Quadro de Funcionários","prompt":"Evolução do quadro de funcionários e PJ. Inclua tabela mês a mês e gráfico de evolução.","chart_meta":[{"tipo":"linha","titulo":"Evolução do quadro CLT vs PJ"}],"children":[
    {"numero":"5.1","titulo":"Número de Funcionários/Colaboradores Total","prompt":"Total de colaboradores no período."},
    {"numero":"5.2","titulo":"Número de Funcionários CLT","prompt":"Quadro CLT comparado mês a mês."},
    {"numero":"5.3","titulo":"Número de Pessoas Jurídicas - PJ","prompt":"Contratados PJ no período."},
    {"numero":"5.4","titulo":"Folha de Pagamentos CLT","prompt":"Valores da folha, INSS e FGTS, quitação. Cite fonte (folha de pagamento, GFIP)."}
  ]},
  {"numero":"6","titulo":"Análise dos Dados Contábeis e Informações Financeiras","prompt":"Análise detalhada do balanço patrimonial. Use o balancete consolidado do período. Sempre cite fonte e período.","chart_meta":[{"tipo":"barra","titulo":"Composição do Ativo (Circulante x Não Circulante)"},{"tipo":"barra","titulo":"Composição do Passivo (Circulante x Não Circulante x PL)"}],"children":[
    {"numero":"6.1","titulo":"Ativo (descrição/evolução)","prompt":"Ativo circulante, não circulante, estoques e imobilizado. Mostre evolução interanual com %."},
    {"numero":"6.2","titulo":"Passivo (descrição/evolução)","prompt":"Passivo circulante e não circulante, principais variações."},
    {"numero":"6.3","titulo":"Passivo Extraconcursal","prompt":"Fiscal, contingência, dívida ativa, cessão fiduciária, alienação fiduciária, arrendamento, ACC, obrigações de fazer/dar/entregar/ilíquidas."}
  ]},
  {"numero":"7","titulo":"Patrimônio Líquido","prompt":"Análise do PL com base nos demonstrativos do período (capital social, reservas, prejuízos acumulados).","chart_meta":[{"tipo":"linha","titulo":"Evolução do Patrimônio Líquido"}]},
  {"numero":"8","titulo":"Endividamento Pós Ajuizamento da RJ","prompt":"Tributário, trabalhista, fornecedores, empréstimos, outros. Tabela por classe e gráfico de composição.","chart_meta":[{"tipo":"pizza","titulo":"Composição do endividamento pós-RJ"}]},
  {"numero":"9","titulo":"Fluxo de Caixa","prompt":"Previsto x realizado no mês e projeção 6 meses. Apontar desvios relevantes.","chart_meta":[{"tipo":"linha","titulo":"Previsto x Realizado"},{"tipo":"linha","titulo":"Projeção de Fluxo de Caixa 6 meses"}]},
  {"numero":"10","titulo":"Contas a Pagar","prompt":"Aging de vencidos e a vencer (0-30, 30-90, 90-180, >180).","chart_meta":[{"tipo":"barra","titulo":"Aging de Contas a Pagar"}]},
  {"numero":"11","titulo":"Contas a Receber","prompt":"Aging de vencidos e a vencer (0-30, 30-90, 90-180, >180).","chart_meta":[{"tipo":"barra","titulo":"Aging de Contas a Receber"}]},
  {"numero":"12","titulo":"Demonstração de Resultados","prompt":"Faturamento, CMV/Receita, Resultado/Receita, EBITDA. Comparativo com períodos anteriores.","chart_meta":[{"tipo":"linha","titulo":"Receita x Resultado x EBITDA"}]},
  {"numero":"12.1","titulo":"Indicadores Financeiros (KPIs)","prompt":"Apresente e interprete: Margem Bruta, Margem EBITDA, Liquidez Corrente (AC/PC), Liquidez Geral ((AC+RLP)/(PC+PNC)), Endividamento (PT/AT), ISG (AT/PT). Use valores reais do balancete consolidado.","chart_meta":[{"tipo":"barra","titulo":"KPIs do período"}]},
  {"numero":"13","titulo":"Diligência no Estabelecimento da Recuperanda","prompt":"Registro de diligências realizadas no período."},
  {"numero":"14","titulo":"Remuneração do Administrador Judicial","prompt":"Conforme determinação judicial."},
  {"numero":"15","titulo":"Fatos Relevantes","prompt":"Pedidos de esclarecimentos, documentos complementares, eventos significativos."},
  {"numero":"15.1","titulo":"Diagnósticos e Inconsistências Identificadas","prompt":"Liste problemas identificados pela IA: inconsistências contábeis, lacunas documentais, riscos financeiros. Para cada item, indique a fonte e a severidade (alta/média/baixa)."},
  {"numero":"16","titulo":"Conclusão e Recomendações","prompt":"Conclusão executiva: situação geral da Recuperanda. Recomendações priorizadas (alto/médio/baixo impacto), com fundamento em evidências do próprio relatório. Encaminhamentos ao Juízo."}
]'::jsonb,
       updated_at = now()
 WHERE tipo = 'rma_mensal';
