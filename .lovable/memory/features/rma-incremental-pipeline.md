---
name: RMA Incremental Pipeline (DB)
description: Camada SQL incremental — detect_file_delta(), trigger de enqueue automático em processing_queue e versionamento automático em document_versions/document_latest
type: feature
---

# RMA Incremental Pipeline (DB layer)

Migração `RMA IA INCREMENTAL v2` adicionou **somente o que faltava** sobre as tabelas existentes (onedrive_files, processing_queue, ocr_cache, ai_extractions, document_state, document_versions já estavam ricas).

## Componentes
- **`document_latest`**: ponteiro `document_id → latest_version, last_stage`. RLS: admin gerencia, consultor lê.
- **`detect_file_delta(file_id, etag, hash, last_modified) → text`**: retorna `new | updated | pending | unchanged`. SECURITY DEFINER, STABLE, search_path=public.
- **Trigger `trg_enqueue_processing`** (AFTER INSERT/UPDATE OF status,etag,hash em `onedrive_files`): quando status vira `new`/`updated`, insere em `processing_queue` (skip se já houver pending/processing para o mesmo `file_id`).
- **Trigger `trg_version_document`** (AFTER INSERT/UPDATE em `document_state`): grava nova linha em `document_versions` (UPSERT por `(document_id, version, stage)`) e atualiza `document_latest`. Não versiona se `last_stage` e `extracted_data` não mudaram.

## Comportamento esperado
1. Edge `onedrive-sync` faz upsert em `onedrive_files` com status delta → fila se forma sozinha.
2. Edge `rma-analyze` / `balancete-build` em modo incremental processam só itens da `processing_queue` ou arquivos com `status IN ('new','updated')`.
3. Cada `document_state` mutado gera histórico automático — não precisa mais escrever em `document_versions` no código da edge.
