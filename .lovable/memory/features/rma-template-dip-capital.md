---
name: RMA Template DIP (Capital AJ)
description: Template oficial rma_mensal_dip com 17 tópicos e 3 níveis alinhado ao RMA da Capital Administradora Judicial (CNJ 72/2020)
type: feature
---

# RMA Template DIP — Capital AJ

## Origem
Espelha o documento "DIP — RMA — Março/2026" da Capital Administradora Judicial (Diplomata RJ). 41 páginas, 17 tópicos, 3 níveis de hierarquia.

## Banco
- `rma_document_templates.tipo = 'rma_mensal_dip'`
- `structure` (jsonb) com nós: `numero`, `titulo`, `prompt`, `chart_meta`, `data_source`, `children`.
- Coexiste com o template legado `rma_mensal` (CNJ 72/2020).

## Hierarquia
0, 1–4 (alterações cadastrais), 5 (quadro funcionários: 5.1–5.4, 5.4.1–5.4.2),
6 (balanço: 6.1.1–6.1.4 / 6.2.1–6.2.2 / 6.3.1–6.3.11),
7 (PL), 8 (8.1–8.3), 9 (9.1–9.2), 10 (10.1–10.2), 11 (11.1–11.2),
12 (12.1 → 12.1.2–12.1.5), 14, 15 (15.1–15.6), 16, 17 (pendências), 18 (apensos).

## Grounding
Cada seção tem `data_source` que indica a fonte canônica do Workspace
(ex.: `bs.ativo_circulante`, `folha.inss_fgts`, `fluxo.previsto_realizado`). O orquestrador
`rma-doc-section-ai` lê esta chave para injetar `<dados_extraidos>` no prompt.

## Renderização (.docx)
`rma-doc-consolidate-docx` agora:
- Resolve heading H1/H2/H3 pela profundidade de `numero` (0 pontos / 1 ponto / 2+ pontos).
- Renderiza capa DIP com Juízo, autos, mês de referência, Recuperanda+CNPJ e responsável técnico,
  lidos de `companies` (pelo `rma_id`) e de `rma_documents.metadata` (`juizo`, `autos`,
  `administrador_judicial`, `responsavel_tecnico`, `mes_referencia`, `ano_referencia`).
- Rodapé institucional (Recomendação CNJ 72/2020) sem branding BEx.
- Limiar para auto-emissão do .docx: 70%.

## UI
`RMAParecerFinalTab` ganha um seletor "RMA Mensal (CNJ 72 — legado)" vs
"RMA Mensal — DIP (Capital AJ, oficial)" quando aberto para um RMA mensal.
