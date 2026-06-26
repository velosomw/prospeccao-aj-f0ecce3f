---
name: AI Dataset + Learning Loop
description: Ground truth humano, embeddings, prompt builder inteligente (few-shot por similaridade) e quality score do sistema de agentes
type: feature
---

# Dataset + Learning Loop

## Tabelas
- **ai_extractions** — dataset_raw automático (toda execução do agente).
- **dataset_validated** — ground truth humano: extraction_id, classe, agent, input_text, normalized_text, output_original, output_correto, corrections, validated_by, source.
- **prompt_examples** — few-shot library com `embedding extensions.vector(768)`, `weight`, `active`.

## Função SQL
- `search_prompt_examples(query_embedding, target_classe, threshold, count)` — top-k por cosine.

## Edge Functions
- **ai-validate** (verify_jwt=false; valida JWT em código):
  - `POST /ai-validate` → grava `dataset_validated`, marca extração como `valid=true` com `extracted_data` corrigido, gera embedding (`google/text-embedding-004`) e ingere em `prompt_examples`.
  - `GET /ai-validate?pending=1&limit=N` → lista extrações com `final_confidence < 0.75` ou `valid=false` ainda não corrigidas.
  - `GET /ai-validate?quality=1` → quality score: precisão, erros, confiança média, melhoria_pct (últimas 100 vs primeiras 100), por_classe.
- **ai-process** — agora com **Prompt Builder Inteligente**: antes de extrair, gera embedding do texto normalizado, busca exemplos similares por classe (top 3, threshold 0.7) e injeta como few-shot no system prompt.

## Embeddings
Modelo: `google/text-embedding-004` (768 dims) via Lovable AI Gateway (`/v1/embeddings`).

## Service frontend (`src/services/datasetService.ts`)
- `listPendingForReview(limit)`
- `submitCorrection(input)` → ground truth + embedding + prompt_examples
- `getQualityScore()`
- `listValidatedByClass(classe)`, `listActiveExamples(classe)`

## Fluxo do Learning Loop
1. Documento OCR → Agente IA → resultado em `ai_extractions`.
2. Confiança baixa ou erro → entra em "pendentes".
3. Humano corrige → `submitCorrection` grava `dataset_validated` + embedding em `prompt_examples`.
4. Próximas execuções da mesma classe recebem esses exemplos via similaridade.
5. Quality Score mede evolução ao longo do tempo.
