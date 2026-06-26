---
name: RMA Document Independent Rules
description: Regras separadas Parecer Técnico vs RMA Mensal — limiares de finalização, tom de IA, aprovação de Coordenador
type: feature
---

# Regras independentes por tipo de documento RMA

Arquivo: `src/lib/rmaDocumentRules.ts` (RMA_DOC_RULES + getRmaDocRules).

## parecer_tecnico (Parecer Técnico Contábil)
- Tom IA: pericial (tese/fundamentação/conclusão).
- minPctAutoFinal: 100, minPctManualFinal: 90.
- requireCoordinatorApproval: true, allowPartialFinalize: false.
- Cadência: pontual.

## rma_mensal (CNJ 72/2020)
- Tom IA: descritivo, cronológico, factual.
- minPctAutoFinal: 70, minPctManualFinal: 50.
- requireCoordinatorApproval: false, allowPartialFinalize: true.
- Cadência: mensal, atualizável incrementalmente.

## Aplicação
- `useRmaDocument` expõe `rules`, `aprovadoPct`, `canAutoFinalize`, `canManualFinalize`.
- Auto-trigger de `regenerateFinal` em `setStatus` usa `rules.minPctAutoFinal`.
- Edge `rma-doc-consolidate-docx`: `MIN_PCT_BY_TIPO` enforce server-side (parecer_tecnico=100, rma_mensal=70).
- Edge `rma-doc-section-ai`: `SYSTEM_PROMPT_BY_TIPO` aplica persona pericial vs descritiva.
- `RelatorioA4View` aceita `finalDisabled` + `finalHint` para refletir limiares por tipo.
