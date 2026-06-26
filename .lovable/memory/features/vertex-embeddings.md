---
name: Vertex AI Embeddings + OCR Semantic Search
description: Embeddings 768D via Vertex AI (text-embedding-004/gecko@003) reusando GOOGLE_VISION_CREDENTIALS, tabela ocr_embeddings com PGVector e edge function ai-search-similar
type: feature
---

# Vertex AI Embeddings (Produção)

## Provider
- Vertex AI `publishers/google/models/text-embedding-004:predict` (gecko@003 compatível, 768 dims).
- Service Account: reusa `GOOGLE_VISION_CREDENTIALS` (escopo `cloud-platform`).
- Location/modelo configuráveis via `VERTEX_LOCATION` (default `us-central1`) e `VERTEX_EMBEDDING_MODEL`.
- Token OAuth com cache em memória, refresh automático antes da expiração.
- Truncagem em 2000 chars (MAX_CHARS) para custo/limite.

## Módulo compartilhado
`supabase/functions/_shared/vertex-embeddings.ts` exporta `generateEmbedding(text)` (retorna `number[] | null`, never throws).

## Onde é usado
- **ai-process**: prompt builder few-shot (busca em `prompt_examples` por similaridade).
- **ai-validate**: ground truth → grava embedding em `prompt_examples`.
- **ocr-google-vision**: após OCR concluído (sync e async), chama `persistOcrEmbedding` que grava em `ocr_embeddings`.

## Tabela `ocr_embeddings`
- Colunas: document_id, ocr_result_id, rma_id, classe, agent, path, text, normalized_text, embedding (vector 768), source.
- Índice IVFFlat cosine (`vector_cosine_ops`, lists=100).
- RLS: admins (gestor_ia/coordenador) full; consultor SELECT.

## Função SQL
`search_ocr_embeddings(query_embedding, target_classe?, target_rma_id?, threshold=0.7, count=5)` → top-K por cosine similarity, com filtros opcionais por classe e RMA.

## Edge Function `ai-search-similar`
- `POST /ai-search-similar { text, classe?, rma_id?, threshold?, limit? }`
- Gera embedding do `text` via Vertex AI, chama `search_ocr_embeddings` e retorna `{ embedding_dims, count, results[] }`.
- Auth: requer JWT válido.

## Fluxo end-to-end
1. OCR → normalize → grava `ocr_results` (status=completed).
2. `persistOcrEmbedding` (best-effort, não bloqueia OCR) → grava `ocr_embeddings`.
3. Pipeline IA (`ai-process`) e Learning Loop (`ai-validate`) usam o mesmo provider Vertex.
4. Frontend pode buscar similares via `ai-search-similar` para sugestões/auto-complete.
