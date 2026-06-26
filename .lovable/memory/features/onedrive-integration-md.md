---
name: onedrive-integration-md
description: Arquitetura OneDrive Delegated via Lovable Connector + regras MD (base_path, validações, polling, auditoria)
type: feature
---
Conta: projetorma@brasilexpert.com.br · Modo: Delegated OAuth (gateway Lovable, não Application/Client Credentials).
Share URL fixo: https://bexonedrive-my.sharepoint.com/:f:/g/personal/tecnico_brasilexpert_com_br/IgA6tcBZSKW9Qq9kqTMlHODwAWn9lmWTkQNwh_kj1yOvzxA
base_path: "Projeto RMA" (enforce_path_restriction=true).
Estrutura híbrida: /Projeto RMA/{CLIENTE}/{ANO}/{PERIODO}/{ENTRADAS,PROCESSANDO,PROCESSADOS,RELATORIOS,AUDITORIA,ERROS} com auto_create_folders=true.
Validação: extensões pdf/docx/xlsx/xls/png/jpg/jpeg/csv/txt; max 50MB; nomeação RMA_{ID}_{TIPO}_{TIMESTAMP}.{ext}.
Edge functions: onedrive-list (proxy), onedrive-sync-rma (inventário tópicos + pipeline_documents), onedrive-poll-entradas (move válidos→PROCESSANDO, inválidos→ERROS).
Helpers compartilhados em supabase/functions/_shared/onedrive.ts.
Auditoria: pipeline_logs com steps onedrive_sync_rma | onedrive_poll_entradas | onedrive_poll_move | onedrive_poll_invalid (sentinel doc 00000000-... para eventos system-level).
UI Gestor IA → Integrações Drives & E-mail: 4 abas (Conexões/Regras/Sync/Auditoria), formulário OAuth manual removido (credenciais vivem no connector).
