---
name: RMA Intelligent Document Architecture
description: Escopo IA → Pré-Parecer → Relatório Final. Templates parametrizáveis, seções com versionamento, IA Gemini por seção
type: feature
---
Tabelas: rma_document_templates (tipo único + structure JSON hierárquica), rma_documents (instância por rma_id+tipo, status rascunho/em_producao/pre_parecer/finalizado), rma_document_sections (numero/titulo/conteudo_ia/conteudo_editado/status pendente→em_edicao→revisado→aprovado→concluido + assigned_to + versao_atual), rma_document_section_versions (imutável, origem=ia_inicial/ia_refeito/editor_manual/revisao_coordenador), rma_document_section_comments.

Templates seedados: 'parecer_tecnico' (modelo Raízen, 9 seções com children em 5.x) e 'rma_mensal' (modelo BEx CNJ 72/2020, 16 seções com children em 5.x e 6.x).

Edge functions:
- rma-doc-init: cria documento a partir de template, expande seções flat com parent_id por numero. Reusa documento existente em rascunho/produção.
- rma-doc-section-ai: gera (mode=generate) ou refaz (mode=rewrite) usando google/gemini-2.5-flash via Lovable AI Gateway. Inclui contexto das outras seções já redigidas (até 8, 600 chars cada). Persiste versão e atualiza tokens_usados. Sistema prompt 'Auditor Contábil Sênior IA' com regras: nunca inventar dados, linguagem parecer técnico, comparações interanuais com %, prosa contínua sem markdown.

UI: src/hooks/useRmaDocument.ts + src/components/rma/document/RmaIntelligentEditor.tsx (sumário lateral com dots de status, painel central com texto IA + textarea editor + comentários + 6 ações: Salvar/Aceitar/Refazer IA/Comentar/Encaminhar/Concluir + dashboard de progresso topo). Plugado em RMAParecerTab e RMARelatorioTab.

Status colors: pendente=red, em_edicao=amber, revisado=sky, aprovado=emerald, concluido=emerald-600.
