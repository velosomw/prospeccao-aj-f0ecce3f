---
name: AI Agent Engine
description: Engine de agentes (Classify → Router → Agente Especializado → Validador) com modo síncrono e assíncrono em lote para textos longos
type: feature
---

# Engine de Agentes (Produção)

Edge function: `supabase/functions/ai-process/index.ts` (verify_jwt=false).

## Pipeline
1. **Classificador** — texto OCR + `path` da pasta. Classes: PIX, COMPROVANTE, BOLETO, BALANCETE, DRE, OUTRO.
2. **Router** — `agentMap` mapeia classe → agente especializado.
3. **Agente Especializado** — extração estruturada via tool calling.
4. **Validador** — auditor compara JSON com OCR; retorna `valido`, `correcoes[]`.

## Modos
- **Síncrono**: documentos com texto ≤ 15.000 caracteres (~5 páginas). POST retorna o resultado completo.
- **Assíncrono em lote**: textos > 15.000 caracteres OU `async: true`. POST retorna `202 + { id, pollUrl }`.
  - Texto dividido em chunks de ~5 páginas (15k chars), preferindo quebra em parágrafo/linha.
  - Background via `EdgeRuntime.waitUntil`; atualiza `progress` (0-100), `chunks_processed/total`, `partial_results`.
  - **Agregação**: BALANCETE/DRE → soma campos numéricos + recálculo de margem; demais → lista de itens.
  - Validador roda 1x sobre o resultado consolidado (com sample do texto).

## Endpoints
- `POST /ai-process` → inicia (sync ou async automático). Aceita `resume_from_id` para retentativa que reaproveita `partial_results` do job anterior.
- `POST /ai-process { async: true }` → força async.
- `GET /ai-process?id=<uuid>` → status/progresso/resultado parcial ou final.
- `DELETE /ai-process?id=<uuid>` → cancela job (status→`canceled`). Worker checa entre chunks e interrompe cooperativamente. 409 se job já terminal.

## Retentativa (retry)
- Service: `retryProcessing(previousJobId)` — só aceita jobs `canceled`/`failed`. Cria novo job assíncrono com mesmo `document_id`/`rma_id`/`raw_text` e `resume_from_id` apontando para o anterior.
- Worker recupera `partial_results` do job anterior e processa apenas os chunks restantes (`startIdx = resumed.length`), economizando tempo e custo de IA.
- Componente UI: `src/components/rma/RetryAsyncJobButton.tsx` — botão com toast e polling integrado, só renderiza para status `canceled`/`failed`.

## Persistência (`ai_extractions`)
Campos: document_id, rma_id, path, classe, agent, raw_text, normalized_text,
ocr/ai/final confidence, extracted_data, validation, valid, corrections,
**status** (pending/processing/completed/failed), **progress**, **chunks_processed**,
**chunks_total**, **partial_results**, error_message, duration_ms.

## Score final
`final_conf = ocr_conf * 0.4 + média(ai_conf) * 0.6`

## Service frontend (`src/services/aiProcessService.ts`)
- `processDocument(input)` → `AiProcessSyncResult | AiProcessAsyncStarted`
- `startAsyncProcessing(input)` → força async
- `getProcessingStatus(id)` → snapshot
- `waitForProcessing(id, onProgress)` → polling até completed/failed
