---
name: Consolidation Worker
description: Worker determinístico que calcula indicadores, Kanitz, Score BEx-RJ e payload de relatório a partir de ai_extractions.extracted_data
type: feature
---

# Worker de Consolidação

**Edge function**: `consolidate-worker` — POST `{ document_id?, extraction_id?, persist? }`.
**Módulo puro**: `supabase/functions/_shared/consolidation.ts` exporta `consolidate(input)`.

## Pipeline
1. Carrega `ai_extractions` (mais recente `completed`) por document_id/extraction_id.
2. Resolve contexto (empresa via `companies.name`, ano via `execution_year`, mes via `current_period_month`); aceita override em `extracted_data.periodo`.
3. Extrai métricas usando aliases (`ativo_circulante`, `pl`, `receita_liquida`...) e deriva totais ausentes.
4. Calcula `Indicadores` (LC, LS, LG, LI, endividamento, margens, ROE, ROA, EBITDA margem).
5. Calcula `Kanitz` (FI = 0.05·X1 + 1.65·X2 + 3.55·X3 − 1.06·X4 − 0.33·X5) → solvente | penumbra | insolvente.
6. Calcula `Score BEx-RJ` (0..100) via penalidades de liquidez, endividamento, margem e Kanitz.
7. Gera `alertas` (LC<1, endividamento>70%, prejuízo, quebra de equação contábil A=P+PL com tolerância 1%).
8. Monta `relatorio` com sumário + blocos (indicadores, kanitz, score, alertas, métricas brutas).
9. Persiste em `ai_extractions.partial_results.consolidation` e espelha em `rma_period_analyses` (status `consolidado`).

## Integração com Multi-Agente
`process-queue` chama `consolidate-worker` quando a rota inclui `CONSOLIDATION` (após OCR + LLM). Falha aqui é **não-fatal** para o job.
