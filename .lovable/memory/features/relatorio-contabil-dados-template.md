---
name: Relatório Contábil de Dados (Template)
description: Template de referência (docx) para gerar relatórios contábeis por período (mensal/bimestral/trimestral/semestral/anual) a partir de balancete_consolidado + indicadores.
type: reference
---

Arquivo de referência: `.lovable/references/Relatorio_Contabil_Dados_REF.docx`

## Estrutura (8 páginas)
1. **Capa + Sumário Comparativo** (tabela N meses): Mês | AT | PT | PL | Endiv. % | Liq.Corrente
2. **Por mês (1 página cada)**:
   - Resumo Patrimonial: AT, AC, ANC, PT, PC, PNC, PL — Valor + % do AT
   - Composição Detalhada do Endividamento (PC + PNC, valor + %)
   - Indicadores Calculados:
     - Liquidez Corrente = AC ÷ PC
     - Liquidez Geral = (AC+RLP) ÷ (PC+PNC)
     - Endividamento Total = PT ÷ AT
     - Endividamento Curto Prazo = PC ÷ AT
     - Endividamento Longo Prazo = PNC ÷ AT
     - Composição do Endividamento = PC ÷ PT
     - Capital de Terceiros = PT ÷ (PT+PL)
     - Imobilização do PL = (AT − AC) ÷ PL

## Header
- BEX AUDITORIA — Auditor Contábil Sênior IA
- Título: "Relatório Detalhado por Mês — Composição, Endividamento e Balanço"
- Período: "<MesInicial>/<Ano> a <MesFinal>/<Ano> (N meses)"
- "Emitido em DD/MM/AAAA"

## Fonte de dados (plataforma)
- `balancete_consolidado` (por company_id + mes/ano) — fonte primária dos valores
- `rma_period_analyses` — indicadores já calculados quando disponíveis
- Período flexível: mensal, bimestral, trimestral, semestral, anual (agrupar por intervalo de `period_label`)

## Agrupamento por período
- Mensal: 1 linha/mês
- Bimestral/Trimestral/Semestral/Anual: somar AT/PT/PL ponderado por último mês do bucket (snapshot) — NÃO somar saldos de balanço entre meses; usar último mês do intervalo como referência e mostrar variação inicial→final.
