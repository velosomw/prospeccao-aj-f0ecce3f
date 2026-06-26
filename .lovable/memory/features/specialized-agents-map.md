---
name: Specialized Agents Map
description: 12 agentes especializados (+ fallback) cobrindo os 60 tópicos RMA, com mapa topicId→agentKey
type: feature
---

# Agentes Especializados × Tópicos RMA

Arquivo: `src/lib/specializedAgents.ts` + seed em tabela `ocr_agents`.

## 12 Agentes (+ Genérico)

| Key | Tópicos | Modelo |
|---|---|---|
| AGENTE_FINANCEIRO_CONTABIL | 5,6,7,8 (Fluxo Caixa, FC Projetado, Balancete, DRE) | gemini-2.5-pro |
| AGENTE_EXTRATOS_BANCARIOS | 13,14 (Extratos CC, Investimentos) | gemini-2.5-pro |
| AGENTE_CONTAS_PAGAR_RECEBER | 24,25,26 (CAP, CAR, dívidas) | gemini-2.5-flash |
| AGENTE_COMPROVANTES_PAGAMENTOS | 12,22,36 (PIX/TED/Boletos) | gemini-2.5-flash |
| AGENTE_TRIBUTARIO | 18,19,20,21,23,40,45,49,50 (GIA, EFD, GFIP, parcel., div. ativa, IR) | gemini-2.5-pro |
| AGENTE_FISCAL_NFE | 11,41,42 (NFs compras, relação analítica, razão fiscal) | gemini-2.5-flash |
| AGENTE_RH_FOLHA | 15,16 (Folha, rescisões) | gemini-2.5-flash |
| AGENTE_OPERACIONAL_ESTOQUE | 9,10,43,44,46,51 (estoque, imobilizado, leilões, fornec/clientes) | gemini-2.5-flash |
| AGENTE_JURIDICO_OBRIGACIONAL | 27,28,29,30,31,58 (obrigações, contingência, acordos) | gemini-2.5-pro |
| AGENTE_GARANTIAS_CREDITO | 32,33,34,35,47,48 (cessão/alienação fid., leasing, ACC, partes relac.) | gemini-2.5-pro |
| AGENTE_SOCIETARIO_ESTRUTURA | 1,2,3,4,17,37 (atividade, organograma, segmento, PJ contratadas) | gemini-2.5-flash |
| AGENTE_COMERCIAL_RECORRENTES | 52,53,54,55,56,57,59,60 (transmissão, patrocínios, mkt, aluguéis, comissões, orçamento) | gemini-2.5-flash |
| AGENTE_GENERICO (fallback) | 38,39 (Pendência RMA, outras infos) | gemini-2.5-flash |

## Fluxo
1. Usuário escolhe tópico (1..60) em /gestao-agentes → Upload & Processamento.
2. `getAgentForTopic(topicId)` resolve o agente; UI mostra badge com nome+modelo+temp.
3. Upload aceita N arquivos do mesmo tópico (mesmo agente para todos).
4. `path = learning/<slug>/<file>` continua alimentando prompt-builder + learning loop.

## Persistência
- Static: `src/lib/specializedAgents.ts` (TOPIC_TO_AGENT, SPECIALIZED_AGENTS).
- Dinâmico (editável pelo Gestor IA): tabela `ocr_agents` — 13 registros seedados;
  `classification_rules` guarda `[{key:"topics",topics:[...]}]` para retrolookup.
