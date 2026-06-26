---
name: two-stage-pipeline
description: Pipeline de extração em 2 estágios — Google Vision OCR + Lovable AI Flash-Lite/Flash/Pro para JSON
type: architecture
---
Arquitetura econômica e precisa para OCR + extração estruturada.

**Estágio 1 — OCR puro** (`ocr-google-vision`):
- Google Vision DOCUMENT_TEXT_DETECTION (~US$ 0,0015/página)
- Aceita API key OU Service Account JSON em `GOOGLE_VISION_CREDENTIALS`
- PDFs >5 páginas: split via pdf-lib em chunks de 5, processados sync por chunk (funciona com API key)
- Normalização: l→1, O→0, R$ l → R$ 1, colapso de espaços

**Estágio 2 — Extração JSON** (`ai-process` via Lovable AI Gateway):
- **Padrão**: `google/gemini-2.5-flash-lite` (~US$ 0,0003/doc) — classificação + agentes genéricos
- **Fallback automático**: se Flash-Lite confiança <0.7 → reprocessa com `gemini-2.5-flash`
- **Crítico**: `gemini-2.5-pro` apenas para BALANCETE e DRE (validação contábil estrita)
- Tool calling para structured output (nunca pedir JSON em prompt)

**Custo estimado total**: ~US$ 0,003/documento (10k págs/mês ≈ US$ 13,50)

**Embeddings semânticos** (`vertex-embeddings.ts`):
- Best-effort: retorna null se `GOOGLE_VISION_CREDENTIALS` for API key (não JSON)
- Pipeline segue sem embeddings quando indisponível
