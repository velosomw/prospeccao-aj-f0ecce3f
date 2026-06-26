---
name: rma-analyze incremental
description: rma-analyze usa Delta Engine + rma_file_parse_cache para reaproveitar parses anteriores e processar só arquivos novos/alterados
type: feature
---

# rma-analyze incremental (V2)

## Problema
A versão antiga reprocessava 100% dos arquivos do OneDrive a cada execução (download + Gemini), ignorando completamente o Delta Engine já existente em `onedrive_files`.

## Solução
1. **`rma_file_parse_cache`** (nova tabela) — guarda `balanco/dre/tipo` extraídos por arquivo, chaveado por `(file_id, parser_version)`. Inclui `etag`, `last_modified`, `hits`, `last_used_at`.
2. **`getOrParseFile()`** em `rma-analyze/index.ts`:
   - Lookup em `onedrive_files` → `decideDelta()` (etag/last_modified vs last_processed_at).
   - **action=ignore** → tenta `rma_file_parse_cache` (etag não mudou). Se hit → retorna cache, bumpa `hits/last_used_at`. **Sem download nem chamada à IA.**
   - **action=new/updated** OU cache vazio → marca tracker `processing` → download Graph → `parseDocumentWithAI` → upsert cache → tracker `processed`.
   - Erros marcam tracker como `error` com `error_message`.
3. **Logs** por tópico mostram `X reaproveitados do cache, Y novos/atualizados`.

## Parser version
`PARSER_VERSION = "v1"`. Bumpe quando o `PARSE_PROMPT` mudar de forma incompatível para invalidar o cache.

## Limites mantidos
`MAX_FILES_PER_TOPIC = 3`, `PARSE_MAX_BYTES = 12 MB`, extensões pdf/png/jpg/jpeg.
