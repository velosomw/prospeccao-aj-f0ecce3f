---
name: Pipeline Incremental V2
description: Arquitetura event-driven com Delta Engine, onedrive_files, processing_queue, ocr_cache, document_versions e build incremental
type: feature
---

# Pipeline Incremental (Reformulação V2 — Fases 1-4)

## Arquitetura
[OneDrive] → [monitor-onedrive] → [onedrive-sync-rma + Delta Engine]
→ [onedrive_files + processing_queue] → [process-queue]
→ [ai-full-process] → [ocr-google-vision (cache hash) → ai-process → ai-validate]
→ [document_versions + document_state] → [balancete-build incremental]

## Tabelas-chave
- **onedrive_files** — tracking por file_id (etag, hash, version, status: new|updated|queued|processing|processed|error|ignored)
- **processing_queue** — fila com priority (1=alta..10=baixa), attempts/max_attempts, reason (new|updated|manual_retry)
- **ocr_cache** — cache por file_hash (SHA-256 dos bytes), evita reprocessar OCR (hits++/last_used_at)
- **document_versions** — histórico imutável (document_id, version, stage: ocr|extraction|validation|consolidation)
- **document_state** — estado atual (latest_version, last_stage, status)

## Delta Engine (`_shared/delta-engine.ts`)
- `decideDelta(current, existing)` — !existing→NEW · etag mudou→UPDATED · last_modified>last_processed_at→UPDATED · nunca processado→UPDATED · senão→IGNORE
- `trackAndEnqueue(descriptor)` — upsert tracker + enqueue se NEW/UPDATED
- `markProcessed/markError(file_id)`

## OCR Cache (`_shared/ocr-cache.ts`)
- `sha256Hex(bytes)` — hash determinístico
- `lookupOcrCache(hash)` — retorna OCR completo se existir, bumpa hits
- `storeOcrCache(hash, payload)` — upsert por file_hash
- Integrado em `ocr-google-vision`: lookup ANTES de chamar Vision, store após sync OK

## Edge Functions (Fase 1)
- **onedrive-sync-rma** (reescrita) — Delta Engine, só enfileira NEW/UPDATED, mantém pipeline_documents em sync
- **monitor-onedrive** (nova) — varre TODAS as empresas com period_active=true
- **process-queue** (nova) — claim N rows pending (priority asc), dispara ai-full-process, retry max_attempts=3

## Build Incremental Balancete (Fase 4)
- `listMonthDocuments(rmaId, companyId, { incremental })` — quando `force=false` (default), cruza com `onedrive_files` e ignora documentos cujo arquivo está `processed` e `last_modified <= last_processed_at`
- Lançamentos têm `protected=true` e merge_key — soma cumulativa já garante consolidação evolutiva
- `force=true` reprocessa tudo (escape hatch)

## Versionamento por Estágio (Fase 3)
- `_shared/document-versioning.ts` — `saveVersion({document_id, stage, data, ...})` cria snapshot append-only em `document_versions` (version=max+1) e upserta `document_state` com `latest_version`/`last_stage`/`status`/`extracted_data`
- Stages emitidos: `ocr` → `extracted` → `validated` → `cross_validated` → `consolidated` (`failed` em erro)
- Integrado no `ai-full-process` após OCR confirmado, após agente, após validador

## Validador Cross-Doc 2.0 (Fase 3)
- `_shared/cross-validator.ts::runCrossValidation({rma_id, company_id, ano, mes})`
- Regras: cnpj_consistency · period_consistency · balance_equation (Ativo=Passivo+PL, tol 0.5%) · cash_vs_flow · cross_doc_duplicates · dre informativo
- Severidades: low(0.05) · medium(0.15) · high(0.3) · critical(0.5) — score = max(0, 1−Σ penalidades), passed = sem critical && score≥0.7
- Edge function `cross-validate` (POST {rma_id|company_id, ano?, mes?, persist?:bool}); com `persist=true` salva snapshot `cross_validated` em todos os documentos do RMA

## Pendente para próximas iterações
- Dashboard no Gestor IA com KPIs de delta/cache/fila/cross-validation
- Stage `consolidated` final após balancete-build estabilizado
