---
name: AI Model Strategy
description: Estratégia de seleção de modelos Gemini Pro/Flash + Document AI por etapa do pipeline
type: feature
---

# Estratégia de Modelos IA

## Camadas
1. **Document AI (Google Vision)** — OCR de PDFs/imagens (`ocr-google-vision`). Interpretação documental, complemento de entrada para o Flash.
2. **Gemini 2.5 Flash** (`google/gemini-2.5-flash`) — padrão de análise contextual e alto volume.
   - Usado em: classificação (Classify), agentes não-críticos (PIX, COMPROVANTE, BOLETO, OUTRO), embeddings, prompt builder, learning loop.
3. **Gemini 2.5 Pro** (`google/gemini-2.5-pro`) — etapas críticas com alta exigência de precisão.
   - Usado em: **Validador** (sempre) e **Agentes BALANCETE/DRE** (classes financeiras de alto risco).

## Implementação
- `supabase/functions/ai-process/index.ts`:
  - `MODEL_FLASH`, `MODEL_PRO`, `CRITICAL_CLASSES = {BALANCETE, DRE}`.
  - `pickAgentModel(classe)` → seleciona Pro ou Flash.
  - `validate()` força `MODEL_PRO`.
  - `runAgent()` retorna `model_used` para auditoria.
- Erros 429/402 do gateway são surfaced com mensagens claras.

## Custos (referência ai_cost_config)
- Pro tem custo ~5-10× Flash → restrito a etapas críticas.
- Document AI cobrado por página no GCP (separado do Lovable AI).
