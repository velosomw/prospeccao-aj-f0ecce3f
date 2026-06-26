---
name: RMA Report Intelligence Engine
description: Novo motor (v3) que produz Relatório Final RMA por evidências - template rma_intelligence + tabela rma_section_evidences + colunas 5-blocos
type: feature
---

# RMA Report Intelligence Engine

Substitui `rma_mensal_dip` como template oficial da aba Relatório Final. O workspace (10 abas) permanece intocado. Cada capítulo é gerado pela IA a partir de dados extraídos + evidências + validações.

## Estrutura
- 14 capítulos fixos (1.Atividade Empresarial ... 14.Conclusão Geral) declarados em `rma_document_templates.structure` (tipo `rma_intelligence`).
- Cada seção tem 5 blocos: `dados_extraidos` (jsonb), evidências (tabela `rma_section_evidences`), `validacao` (jsonb), `analise_ia` (text), `conclusao_ia` (jsonb).
- Risco por seção: `risco` (baixo/medio/alto/muito_alto) + `risk_score` numérico.
- Indicadores globais em `rma_documents`: `executive_summary` (jsonb), `health_score`, `risk_global`.

## Engines (edges - sprints 2-4)
- `rma-report-data-collector`: lê `data_source` de cada seção e busca em bs_consolidado/dre/fluxo/nfe/lancamentos/ai_extractions (grounding ≥ 70).
- `rma-report-evidence-engine`: registra evidência por claim em `rma_section_evidences`.
- `rma-report-narrative`: gera 5-blocos via Lovable AI Gateway (gemini-2.5-flash) com Output.object.
- `rma-report-risk-engine`: calcula risco por seção.
- `rma-report-conclusion`: consolida + executive summary.
- `rma-report-builder`: DOCX com capa DIP, sumário automático, executive summary, 14 capítulos em 5 blocos, apêndices.

## Compatibilidade
- `rma_mensal_dip` e `rma_mensal` continuam disponíveis como fallback.
- Botão "Migrar para Intelligence" copia `conteudo_editado` por `numero`.
