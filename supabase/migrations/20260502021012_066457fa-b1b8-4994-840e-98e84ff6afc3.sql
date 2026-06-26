
-- Templates de documentos parametrizáveis
CREATE TABLE public.rma_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  structure JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documento gerado (instância por RMA)
CREATE TABLE public.rma_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_id TEXT NOT NULL,
  template_id UUID REFERENCES public.rma_document_templates(id),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_producao','pre_parecer','finalizado')),
  progresso NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_at TIMESTAMPTZ
);
CREATE INDEX idx_rma_documents_rma ON public.rma_documents(rma_id);

-- Seções do documento (Escopo IA)
CREATE TABLE public.rma_document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.rma_documents(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.rma_document_sections(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL,
  numero TEXT,
  titulo TEXT NOT NULL,
  conteudo_ia TEXT,
  conteudo_editado TEXT,
  prompt_contexto TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_edicao','revisado','aprovado','concluido')),
  assigned_to TEXT CHECK (assigned_to IN ('usuario','coordenador') OR assigned_to IS NULL),
  insights JSONB DEFAULT '{}'::jsonb,
  versao_atual INTEGER NOT NULL DEFAULT 1,
  tokens_usados INTEGER DEFAULT 0,
  custo_ia NUMERIC DEFAULT 0,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sections_document ON public.rma_document_sections(document_id, ordem);

-- Versões (histórico imutável)
CREATE TABLE public.rma_document_section_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.rma_document_sections(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL,
  conteudo TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('ia_inicial','ia_refeito','editor_manual','revisao_coordenador')),
  motivo TEXT,
  author_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_id, versao)
);

-- Comentários
CREATE TABLE public.rma_document_section_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.rma_document_sections(id) ON DELETE CASCADE,
  author_id UUID,
  author_name TEXT,
  author_role TEXT,
  text TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_section ON public.rma_document_section_comments(section_id, created_at);

-- RLS
ALTER TABLE public.rma_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rma_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rma_document_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rma_document_section_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rma_document_section_comments ENABLE ROW LEVEL SECURITY;

-- Templates: leitura para todos autenticados; escrita só Gestor IA
CREATE POLICY "templates_read" ON public.rma_document_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_write_gestor" ON public.rma_document_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role));

-- Documentos: autenticados leem; criador, coordenador e gestor escrevem
CREATE POLICY "docs_read" ON public.rma_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "docs_write" ON public.rma_documents FOR ALL TO authenticated
  USING (
    auth.uid() = created_by
    OR public.has_role(auth.uid(),'coordenador'::app_role)
    OR public.has_role(auth.uid(),'gestor_ia'::app_role)
  )
  WITH CHECK (
    auth.uid() = created_by
    OR public.has_role(auth.uid(),'coordenador'::app_role)
    OR public.has_role(auth.uid(),'gestor_ia'::app_role)
  );

CREATE POLICY "sections_read" ON public.rma_document_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections_write" ON public.rma_document_sections FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "versions_read" ON public.rma_document_section_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "versions_insert" ON public.rma_document_section_versions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "comments_read" ON public.rma_document_section_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comments_insert" ON public.rma_document_section_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "comments_update_author" ON public.rma_document_section_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(),'coordenador'::app_role));

-- Triggers updated_at
CREATE TRIGGER trg_templates_updated BEFORE UPDATE ON public.rma_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_docs_updated BEFORE UPDATE ON public.rma_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_sections_updated BEFORE UPDATE ON public.rma_document_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seeds
INSERT INTO public.rma_document_templates (tipo, nome, descricao, structure) VALUES
('parecer_tecnico', 'Parecer Técnico Contábil', 'Parecer técnico sobre dados contábeis e financeiros (modelo Raízen)', '[
  {"numero":"1","titulo":"Capa e Identificação","prompt":"Apresente capa institucional com dados da empresa analisada, período e responsável técnico."},
  {"numero":"2","titulo":"Sumário Executivo","prompt":"Resuma em até 6 parágrafos as principais conclusões da análise contábil e financeira."},
  {"numero":"3","titulo":"Introdução e Contexto da Análise","prompt":"Contextualize a análise: empresa, período examinado (ano-safra/calendário), fontes (balanços auditados, site oficial), objetivo do parecer."},
  {"numero":"4","titulo":"Metodologia e Fontes de Dados","prompt":"Descreva a metodologia: NBC TA aplicáveis, dados utilizados, ferramentas (OCR, Document AI, Gemini), validação cruzada."},
  {"numero":"5","titulo":"Análise Financeira","prompt":"Análise financeira consolidada por blocos.","children":[
    {"numero":"5.1","titulo":"Passivo e Endividamento","prompt":"Analise evolução do passivo circulante e não circulante, principais componentes (empréstimos, fornecedores, derivativos, arrendamentos), variações % interanuais. Use APENAS dados reais do RMA. Linguagem técnica contábil."},
    {"numero":"5.2","titulo":"Receita e Desempenho Operacional","prompt":"Analise receita líquida (média mensal e absoluta), evolução interanual, desempenho operacional. Não inventar dados."},
    {"numero":"5.3","titulo":"Custos e Despesas","prompt":"Analise CMV vs receita, despesas financeiras, relação custo+despesa/receita líquida. Aponte quando ultrapassa 100% da receita."},
    {"numero":"5.4","titulo":"Liquidez (Corrente e Geral)","prompt":"Calcule e interprete liquidez corrente (AC/PC) e geral ((AC+RLP)/(PC+PNC)). Compare período a período."},
    {"numero":"5.5","titulo":"Estrutura de Capital","prompt":"Analise imobilizado+intangível vs passivo total e vs PL, imobilização de recursos não permanentes."}
  ]},
  {"numero":"6","titulo":"Eventos Relevantes e Notas Explicativas","prompt":"Resuma fatos relevantes e notas explicativas que impactem a análise (planos de transformação, vendas de ativos, novas linhas de crédito)."},
  {"numero":"7","titulo":"Indicadores (ISG e Solvência)","prompt":"Apresente Índice de Solvência Geral (ISG = Ativo Total / Passivo Total) e justifique escolha vs Kanitz quando aplicável."},
  {"numero":"8","titulo":"Limitações Analíticas","prompt":"Aponte limitações: dados ausentes, escopo restrito, premissas adotadas."},
  {"numero":"9","titulo":"Conclusão (Parecer Técnico)","prompt":"Conclusão crítica: deterioração/melhoria da estrutura econômico-financeira, pontos críticos, recomendações. Coerente com seções anteriores."}
]'::jsonb),
('rma_mensal', 'Pré-Relatório RMA Mensal (CNJ 72/2020)', 'Relatório mensal de atividade de Administração Judicial (modelo BEx)', '[
  {"numero":"0","titulo":"Considerações Iniciais","prompt":"Considerações iniciais sobre escopo do RMA, recomendação CNJ 72/2020, fontes de informação."},
  {"numero":"1","titulo":"Alteração da Atividade Empresarial","prompt":"Houve alteração da atividade empresarial no período? Documentar."},
  {"numero":"2","titulo":"Alteração da Estrutura Societária e Órgãos de Administração","prompt":"Composição acionária e direção atualizadas? Mudanças no período?"},
  {"numero":"3","titulo":"Abertura ou Fechamento de Estabelecimentos","prompt":"Houve abertura/fechamento de filiais ou alteração de endereços?"},
  {"numero":"4","titulo":"Segmento de Atuação","prompt":"Segmento, fontes de informação, associações e sindicatos vinculados."},
  {"numero":"5","titulo":"Quadro de Funcionários","prompt":"Evolução do quadro de funcionários e PJ.","children":[
    {"numero":"5.1","titulo":"Número de Funcionários/Colaboradores Total","prompt":"Total de colaboradores no período."},
    {"numero":"5.2","titulo":"Número de Funcionários CLT","prompt":"Quadro CLT comparado mês a mês."},
    {"numero":"5.3","titulo":"Número de Pessoas Jurídicas - PJ","prompt":"Contratados PJ no período."},
    {"numero":"5.4","titulo":"Folha de Pagamentos CLT","prompt":"Valores da folha, INSS e FGTS, quitação."}
  ]},
  {"numero":"6","titulo":"Análise dos Dados Contábeis e Informações Financeiras","prompt":"Análise detalhada do balanço patrimonial.","children":[
    {"numero":"6.1","titulo":"Ativo (descrição/evolução)","prompt":"Ativo circulante, não circulante, estoques e imobilizado."},
    {"numero":"6.2","titulo":"Passivo (descrição/evolução)","prompt":"Passivo circulante e não circulante, principais variações."},
    {"numero":"6.3","titulo":"Passivo Extraconcursal","prompt":"Fiscal, contingência, dívida ativa, cessão fiduciária, alienação fiduciária, arrendamento, ACC, obrigações de fazer/dar/entregar/ilíquidas."}
  ]},
  {"numero":"7","titulo":"Patrimônio Líquido","prompt":"Análise do PL com base nos demonstrativos do período."},
  {"numero":"8","titulo":"Endividamento Pós Ajuizamento da RJ","prompt":"Tributário, trabalhista, fornecedores, empréstimos, outros."},
  {"numero":"9","titulo":"Fluxo de Caixa","prompt":"Previsto x realizado no mês e projeção 6 meses."},
  {"numero":"10","titulo":"Contas a Pagar","prompt":"Aging de vencidos e a vencer (0-30, 30-90, 90-180, >180)."},
  {"numero":"11","titulo":"Contas a Receber","prompt":"Aging de vencidos e a vencer (0-30, 30-90, 90-180, >180)."},
  {"numero":"12","titulo":"Demonstração de Resultados","prompt":"Faturamento, liquidez, CMV/Receita, Resultado/Receita, EBITDA."},
  {"numero":"13","titulo":"Diligência no Estabelecimento da Recuperanda","prompt":"Registro de diligências realizadas."},
  {"numero":"14","titulo":"Remuneração do Administrador Judicial","prompt":"Conforme determinação judicial."},
  {"numero":"15","titulo":"Fatos Relevantes","prompt":"Pedidos de esclarecimentos e documentos complementares."},
  {"numero":"16","titulo":"Conclusão","prompt":"Encaminhamentos e recomendações ao Juízo."}
]'::jsonb);
