---
name: OneDrive Folder Naming
description: Nomes oficiais das 6 pastas operacionais criadas em "Projeto RMA" no OneDrive (sufixo " IA")
type: feature
---
Pastas operacionais criadas pela plataforma em cada período RMA do OneDrive:
- Entradas IA, Processando IA, Processados IA, Relatórios IA, Auditoria IA, Erros IA.

Códigos programáticos estáveis (`ENTRADAS`, `PROCESSANDO`, `PROCESSADOS`, `RELATORIOS`, `AUDITORIA`, `ERROS`) seguem em `_shared/onedrive.ts` como chaves; `OPERATIONAL_FOLDER_NAMES` mapeia código → nome exibido.

`ensureOperationalSubfolders` renomeia in-place pastas legadas (ex.: "ENTRADAS" → "Entradas IA"), preservando id e arquivos; se duas existirem, mescla os arquivos na nova e remove a vazia. Filtros que ignoram pastas operacionais ao listar tópicos do RMA usam `ALL_OPERATIONAL_FOLDER_NAMES` (case-insensitive, inclui legados + novos).
