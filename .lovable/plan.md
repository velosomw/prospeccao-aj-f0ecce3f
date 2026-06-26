
# RMA Report Intelligence Engine (v3)

Transformar o Relatório Final em documento produzido por evidências: a IA escreve cada capítulo a partir de dados extraídos + validações + análises, mantendo fidelidade ao modelo da Administradora Judicial. O workspace (10 abas, uploads, OCR, agentes especializados, balancete, DRE, fluxo) permanece intocado — só o módulo Relatório muda.

## Escopo

- **Substitui** `rma_mensal_dip` como template oficial na aba Relatório Final.
- **Mantém** `rma_mensal` (CNJ 72 legado) como fallback selecionável.
- **Não toca** nas demais 9 abas do workspace nem nos pipelines de ingestão.

## Arquitetura (engines compostos por edge functions)

```text
RMA REPORT ENGINE (orquestrador: rma-report-engine)
  ├─ data-collector        → consolida fontes por capítulo
  ├─ evidence-engine       → resolve origem (doc/página/confiança) por claim
  ├─ accounting-analysis   → ativo/passivo/PL/estoques
  ├─ financial-analysis    → DRE, índices, storytelling
  ├─ legal-analysis        → processos, eventos, petições
  ├─ operational-analysis  → RH, fornecedores, clientes
  ├─ graph-engine          → KPIs + séries (já existe rma-doc-charts-build)
  ├─ narrative-generator   → 5-blocos por seção
  ├─ risk-engine           → risco por capítulo (baixo/médio/alto/muito alto)
  ├─ conclusion-engine     → conclusão geral + executive summary
  └─ pdf-builder           → DOCX/PDF com capa, sumário, footer
```

## Estrutura obrigatória do relatório (capítulos)

Capa · Sumário · Introdução · 1.Atividade Empresarial · 2.Estrutura Societária · 3.Estabelecimentos · 4.Mercado · 5.Funcionários · 6.Dados Contábeis · 7.Passivo Extraconcursal · 8.Endividamento · 9.Fluxo de Caixa · 10.Contas a Pagar · 11.Contas a Receber · 12.DRE + Índices · 13.Fatos Relevantes · 14.Conclusão Geral · Apêndices.

Cada capítulo (1–13) renderiza **5 componentes fixos**:
1. **Dados extraídos** (tabela JSON do data-collector)
2. **Evidências** (lista doc/página/confiança)
3. **Validação** (conciliado/divergência/pendência)
4. **Análise IA** (narrativa baseada nas evidências)
5. **Conclusão IA** (status · risco · impacto · recomendação)

## Implementação por sprint

### Sprint 1 — Fundação (este turno)
- Migração SQL:
  - Novo template `rma_intelligence` em `rma_document_templates` com 14 capítulos + sub-seções (estrutura JSON com `numero`, `titulo`, `prompt`, `data_source`, `evidence_sources[]`, `chart_meta`).
  - Tabela `rma_section_evidences` (section_id, claim_text, source_type, source_ref, doc_url, page, confidence, created_at) + GRANTs + RLS.
  - Colunas em `rma_document_sections`: `dados_extraidos jsonb`, `validacao jsonb`, `analise_ia text`, `conclusao_ia jsonb`, `risco text`, `risk_score numeric`.
  - Colunas em `rma_documents`: `executive_summary jsonb`, `health_score numeric`, `risk_global text`.

### Sprint 2 — Engines de dados
- Edge `rma-report-data-collector`: por section, lê `data_source` e busca em `bs_consolidado`, `dre_consolidado`, `fluxo_caixa_consolidado`, `nfe_compras`, `lancamentos`, `ai_extractions` (filtrado por grounding ≥ 70). Persiste em `dados_extraidos`.
- Edge `rma-report-evidence-engine`: para cada item coletado, registra evidência em `rma_section_evidences` com `source_ref` (tabela/linha/doc_id) e `confidence`.

### Sprint 3 — Engines de análise + narrativa
- Edge `rma-report-narrative` (substitui `rma-doc-section-ai` para `rma_intelligence`): prompt estruturado que **obriga** saída em 5 blocos JSON; injeta `<dados_extraidos>` + `<evidencias>`; calcula `grounding_score` e marca claims sem evidência.
- Edge `rma-report-risk-engine`: pondera divergências/pendências/variações → `risco` + `risk_score` por seção.

### Sprint 4 — Consolidação
- Edge `rma-report-conclusion`: consolida todas as conclusões → narrativa única + `executive_summary` (KPIs principais, top riscos, recomendações).
- Edge `rma-report-builder` (substitui `rma-doc-consolidate-docx` para `rma_intelligence`): renderiza Capa DIP + Sumário automático + Executive Summary + 14 capítulos em 5 blocos + Apêndices (lista de evidências, docs conciliados, pendências, log IA).
- Reaproveita `rma-doc-charts-build` para gráficos.

### Sprint 5 — UI (aba Relatório Final)
- `RMAParecerFinalTab.tsx`: trocar default para `rma_intelligence`; manter botão "Usar modelo CNJ 72 legado".
- Novo painel interno antes do PDF: tabs "Dados | Evidências | IA | Pendências | Riscos | Texto" por capítulo. Reusa `RmaIntelligentEditor` com renderização dos 5 blocos.
- Botões: Regenerar capítulo · Congelar · Comparar versões · Restaurar.
- Dashboard topo: Health Score, Risk Score, Executive Summary.

## Detalhes técnicos relevantes

- **Compatibilidade**: documentos `rma_mensal_dip` existentes continuam abrindo; novos sempre `rma_intelligence`. Botão de migração copia `conteudo_editado` por `numero`.
- **Prompt 5-blocos**: usa AI SDK `Output.object` com schema Zod (`{dados, evidencias[], validacao, analise, conclusao}`) via Lovable AI Gateway (`google/gemini-2.5-flash`); fallback para parse manual se schema rejeitar.
- **Grounding**: claim sem `evidence_id` é flagged em `ungrounded_claims`; UI marca em amarelo.
- **Cache**: reusa `llm_response_cache` existente.
- **Storage**: mesmo bucket `rma-documents`, path `{rma_id}/rma_intelligence/v{N}.docx`.

## Fora de escopo

- Mudanças no OneDrive/OCR/agentes especializados.
- Renderização PDF (mantém DOCX; PDF vira sprint futura).
- Editor de evidências manual (sprint 6).

## Plano de turnos

Este turno entrega **Sprint 1** completo (migração + seed do template + tipos). Próximos turnos: 2, 3, 4, 5 separadamente para validar a cada passo.

Aprovação esperada: sigo com Sprint 1?
