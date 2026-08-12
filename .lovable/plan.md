---
title: Integração de Dados Reais nos Dashboards
---

# Objetivos
Eliminar todos os placeholders estáticos e arrays vazios nos dashboards de todos os perfis, conectando-os às tabelas canônicas e logs reais.

# Etapas Técnicas

## 1. Infraestrutura de Dados (Hooks e Services)
- **useTeamStats**: Criar um hook para buscar estatísticas reais da equipe (Consultores cadastrados, carga de trabalho, score médio) consumindo a Edge Function `admin-create-user` (ação `list`).
- **useProspeccaoStats**: Estender o `useCompaniesStats` ou criar um novo hook para agregar dados das tabelas `prospeccao_aj_nomeados`, `prospeccao_agcs_realizadas`, `prospeccao_cadastro_aj` e `prospeccao_cartas_aj`.
- **useRecentSyncs**: Criar um hook para buscar os últimos batches de `spreadsheet_import_batches` para exibir no dashboard da Empresa.

## 2. Dashboard do Coordenador (`CoordDashboardAnalitico.tsx`)
- Substituir `consultores`, `aprovacoes` e `evolucao` por dados reais vindos dos hooks acima.
- Mapear a distribuição de status com base nas `companies` e progresso de extração.

## 3. Dashboard do Administrador Judicial (`AdmjudicialDashboard.tsx`)
- Conectar o componente `ProfileHome` ao `useCompaniesStats` filtrado para o perfil logado.
- Substituir a lista de `avisos` estáticos por notificações reais de pendências (arquivos não enviados ou falhas de OCR).

## 4. Dashboard da Equipe (`CoordEquipe.tsx`)
- Popular a tabela de membros usando o hook `useTeamStats`.
- Calcular score e SLA dinamicamente com base nas análises concluídas por cada consultor.

## 5. Dashboard da Empresa (`EmpresaDashboard.tsx`)
- Refinar as "Atividades Recentes" para mostrar logs de sincronização reais (MD-BEX-001) em vez de mensagens genéricas.

# Restrições
- NUNCA manter valores "hardcoded" como `value: 16`.
- Respeitar estritamente o RLS em todas as consultas.
- Usar `Intl.NumberFormat` para valores financeiros.
