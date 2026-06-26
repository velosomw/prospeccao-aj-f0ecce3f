---
name: Motor Balancete BEx V3
description: Pipeline determinístico para balancetes layout BEx (Extenso/Saldo Atual). Filtra folhas len=10, classifica por prefixo de código, consolidado e BS&Dados consomem `codigo` + `saldo` como fonte de verdade.
type: feature
---
**Backend (`balancete-build`)**:
- `extractLines` reconhece campos BEx: `extenso`, `saldo_atual`, `saldo_anterior`, `saldo_mes`, `debito`, `credito`.
- 🚨 Apenas folhas (`len(extenso) === 10`) entram em lançamentos — sintéticas geram duplo cômputo.
- Fonte de verdade do saldo (ordem): `saldo_atual` → `saldo_mes` → `saldo_anterior + (D-C)` → `valor` genérico.
- `classifyByPrefix(codigo)` deriva `tipo` (1=ativo,2=passivo,3=PL,4=receita,5=despesa) e `subgrupo` (11/21=circulante, 12/22=não-circulante) sem IA.
- `matchAccount` usa classificação por prefixo no fallback (confiança 0.55 vs 0.2 antigo).

**Frontend (`bsDados`)**:
- `refMap.REF_BY_PREFIX`: 11101/11104→disponivel, 113→estoques, 211→divida_financeira, 212→fornecedores, 213→trabalhista, 214/2141/2241→tributaria, 218→credores_rj, 221→financeira_lp.
- `mapCodigoToField(codigo)` + `classifyAggByCodigo(codigo)` para totalizadores AC/PC/ANC/PNC.
- `bsDadosBuilder.resolveField` agora prioriza: código contábil → ref1 → regex descrição.
- `consolidadoAdapter` usa `codigo` (não `conta`) como chave de agrupamento e prefere `saldo` sobre `valor`.
- `useConsolidadoBS` SELECT inclui `codigo, saldo`.
- `ParsedRow.codigo?: string` adicionado em `types.ts`.

**Pendências (fases futuras do blueprint)**:
- Migration formal: `chart_of_accounts.codigo/grupo/subgrupo/natureza_dc` + `balancete_consolidado.ref_capital`.
- UI Pivot Consolidado (tabela código×mês estilo XLSX 6 meses).
- Banner de validação Ativo=Passivo+PL na aba BS&Dados (já calculada em `balancete_validacoes`).
- Parser XLSX direto no upload (hoje depende de IA via OCR+ai-process).
