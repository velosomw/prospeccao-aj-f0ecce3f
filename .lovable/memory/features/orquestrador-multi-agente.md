---
name: Multi-Agent Orchestrator
description: Edge function ai-orchestrate decides agents/strategy, runs in parallel, validates by textual evidence, blocks hallucinations, logs to orchestration_log
type: feature
---

# Orquestrador Multi-Agente — RMA (v1)

## Princípio
IA NÃO CRIA, NÃO COMPLETA, NÃO SUPÕE → apenas EXTRAI + VALIDA + CORRELACIONA.

## Pipeline (`supabase/functions/ai-orchestrate/index.ts`)
1. **Decisão IA** (Flash-Lite, tool call `orchestrate_decision`): retorna `{ classe, agentes[], estrategia, justificativa }`. Estratégias: `single | parallel | fallback`.
2. **Execução**: delega a `ai-process` (síncrono). Em `parallel`, dispara N chamadas via `Promise.allSettled`.
3. **Validação cruzada por evidência**: para cada candidato, achata o JSON, gera variantes do valor (número com vírgula/ponto, datas DD/MM/YYYY ↔ YYYY-MM-DD, CPF/CNPJ sem máscara) e checa `ocrText.includes(...)`. Campos null são considerados válidos (permitido).
4. **Score de evidência** = `valid / total`. Thresholds: ≥0.85 accept, 0.7–0.85 review, <0.7 reject.
5. **Vencedor** = maior score.
6. **Anti-alucinação**: campos sem evidência são anulados (`null`) no resultado final.
7. **Fusão** (modo paralelo): merge de campos restantes dos demais candidatos (já sanitizados) preenchendo apenas campos vazios do vencedor.

## Tabela `orchestration_log`
Colunas: `document_id`, `file_id`, `rma_id`, `company_id`, `classe`, `agentes_executados[]`, `agente_vencedor`, `estrategia`, `evidencias` (JSONB com `{key, value, valid, reason}`), `resultado_final`, `score_confianca`, `validado`, `motivo`, `duration_ms`.
RLS: gestor_ia/coordenador full; consultor/owner SELECT por company.

## Endpoint
`POST /ai-orchestrate` body: `{ text, normalized_text?, path?, document_id?, rma_id?, company_id?, ocr_confidence?, file_id?, force_strategy? }`
Resposta: `{ orchestration_id, decision, estrategia, agentes_executados, agente_vencedor, score_confianca, action, validado, extracted_data, evidencias, duration_ms }`.
