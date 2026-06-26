---
name: Embeddings Pipeline (gemini-embedding-001)
description: Geração automática de embeddings 768D em todo OCR novo (cascade + ocr-google-vision)
type: feature
---

# Embeddings Pipeline

## Modelo
`gemini-embedding-001` (Gemini API direta), 768 dimensões, taskType `RETRIEVAL_DOCUMENT`.
Endpoint: `:embedContent` (1 request por chunk, 5 em paralelo).

## Estratégias (fallback automático em `_shared/embeddings.ts`)
1. **Direto via Gemini API** (`GOOGLE_AI_API_KEY`) — preferencial.
2. **Lovable Gateway** `/v1/embeddings` (`google/text-embedding-004`).
3. Se ambas falharem → pipeline OCR continua (warning, não bloqueia).

## Chunking
- `MAX_CHARS_PER_CHUNK = 2000` (~500 tokens), overlap 200 chars, máx 60 chunks/doc.
- Quebra por parágrafos → linhas → sentenças.

## Disparo automático em OCRs novos
- **`ocr-google-vision/index.ts`** (sync e async) chama `persistOcrEmbedding` → `generateEmbeddings` do pipeline unificado, sempre que houver `documentId`.
- **`_shared/ocr-cascade.ts`** chama `generateEmbeddings` ao final de cada OCR concluído.
- Idempotente: pula se já existem embeddings para o `documentId` (verifica `document_embeddings`).

## Persistência
- **`ocr_embeddings`** (sempre, sem FK): document_id, classe, agent, path, text, embedding 768D.
- **`document_embeddings`** (somente se doc existe em `pipeline_documents`): chunk_index, chunk_text, embedding, rma_id.

## Telemetria
`ai_usage_logs` com `service='embedding'`, `model='gemini-embedding-001'`, tokens estimados (chars/4), 1 request por chunk.

## Busca semântica
Edge function **`embed-search`** (POST):
```json
{ "query": "fornecedor inadimplente", "rmaId": "RMA-0002", "classe": "balancete", "threshold": 0.65, "limit": 8 }
```
→ retorna trechos via `search_ocr_embeddings` RPC ordenados por similaridade cosseno.

## Custo
~$0.0001/1k tokens — desprezível mesmo em batches grandes.
