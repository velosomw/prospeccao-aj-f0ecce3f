---
name: RAG Memória Vetorial Context-Aware
description: Retriever sobre company_memory_embeddings com re-rank (sim 40 + recency 25 + freq 20 + conf 15) + boost por tipo, top-K dinâmico, indexer determinístico, integrado ao dynamic-prompt-builder
type: feature
---

# RAG Context-Aware (RMA)

## 3 camadas de memória (em `company_memory_embeddings.tipo`)
- **structural** (`structural`/`regra`/`padrao`) — boost ×1.5 — planos de contas, estrutura balancete.
- **semantic** (`contexto_documento`/`comportamento`) — boost ×1.0 — sinônimos, variações de nomes.
- **operational** (`operational`/`erro`) — boost ×1.2 — erros/correções/ajustes.

## Pipeline
1. `embedQuery(text)` — Gemini text-embedding-004 (768D).
2. RPC `match_company_memory(company_id, threshold=0.65, count=topK*3)`.
3. **Re-rank**: `sim×0.40 + recency×0.25 + freq×0.20 + conf×0.15`, multiplicado por `tipoBoost`.
4. `topK` dinâmico: <800 chars→3, <4000→5, ≥4000→10.
5. Bloco injetado no prompt: `[CONTEXTO RAG — evidências reais...]`.

## Indexação (`indexContext`)
- Dedup determinístico por SHA-256(`companyId|tipo|conteudo`) gravado no campo `source` (sufixo 16 chars do hash).
- `weight` default 1.0; reforço posterior via RPC `reinforce_company_memory`.

## Módulos
- `_shared/rag-retriever.ts` → `ragRetrieve`, `rankContexts`, `ragContextsToPromptBlock`, `indexContext`.
- `POST /rag-context` → `action: retrieve | index | index_batch`.
- Integrado em `_shared/dynamic-prompt-builder.ts` (parâmetro `enableRag`, default true). Conta RAG entra no `histCount` que dispara modo `enriched` e `gemini-2.5-pro` para docs pesados.

## Anti-alucinação
Bloco RAG instrui: "USE APENAS este contexto + o documento atual. Se não houver evidência, retorne null."
