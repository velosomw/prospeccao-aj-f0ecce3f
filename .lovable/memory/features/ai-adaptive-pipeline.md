---
name: AI Adaptive Pipeline
description: Pipeline unificado ai-full-process orquestra OCR→embed→prompt→agente→validador, motor de qualidade (score global + auto-retry <0.7 + pending review <0.5) e antifraude (duplicidade, outliers z-score, inconsistência contábil)
type: feature
---

# Pipeline Adaptativo Unificado

## Endpoint
`POST /ai-full-process { document_id }` → orquestra todo o fluxo a partir só do documento.

## Etapas internas
1. Carrega `pipeline_documents` + `ocr_results` (aguarda se em processamento).
2. Invoca `ai-process` (que já faz embed → prompt builder inteligente → agente → validador).
3. Calcula **quality_score** = `ocr*0.3 + ai*0.5 + validation*0.2` e persiste em `ai_extractions`.
4. Aplica regras de **quality_action**:
   - `< 0.5` → `pending_review` (validação humana obrigatória)
   - `0.5 – 0.7` → `reprocessed` (auto-retry 1x via novo `ai-full-process` com `_retry: true` e `resume_from_id`)
   - `≥ 0.7` → `ok`
5. Roda `fraud-detect` (não bloqueante).
6. `auto_retry_count` limitado a 1.

## Antifraude (`fraud-detect`)
- **Duplicidade**: match por `sha256_hash` em `pipeline_documents`.
- **Outlier**: RPC `detect_outliers_by_classe` com z-score; threshold |z|>3, mínimo 8 amostras. Campos: PIX/COMPROVANTE/BOLETO=`valor`; BALANCETE=`ativo_total`,`passivo_total`,`patrimonio_liquido`; DRE=`receita_liquida`,`lucro_liquido`.
- **Inconsistência**: BALANCETE — verifica `Ativo = Passivo + PL` (diff > 1%).
- Persiste em `fraud_alerts` (status: open/acknowledged/resolved/false_positive; severity: low/medium/high).

## Tabelas
- `ai_extractions` ganhou: `validation_score`, `quality_score`, `quality_action`, `auto_retry_count`.
- Nova `fraud_alerts` com RLS (Gestor/Coordenador gerenciam, Consultor visualiza).

## UI
- Aba **Qualidade & Antifraude** em `/gestor-ia/aprendizado` (`QualityFraudTab.tsx`):
  - KPIs: qualidade média, pendentes, reprocessadas, alertas abertos.
  - Composição do score (OCR/AI/Validação).
  - Lista de alertas com filtro por status e ações Resolver / Falso positivo.
- Service: `src/services/qualityFraudService.ts` (`fullProcess`, `getQualityMetrics`, `listFraudAlerts`, `updateAlertStatus`).
