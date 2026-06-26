---
name: RMA Final DOCX Auto-Generation
description: Edge function rma-doc-consolidate-docx gera Parecer Final em .docx automaticamente quando >=90% das seções estão aprovadas/concluídas; salva em rma-documents/{rma_id}/{tipo}/{titulo}_v{N}.docx, persiste arquivo_final_url + versão em rma_documents, dispara via setStatus no useRmaDocument.
type: feature
---

# Parecer Final automático (.docx)

- **Edge function**: `rma-doc-consolidate-docx` usa `docx@8.5.0` (esm.sh), monta documento A4, header título/versão/% e cada seção como Heading2 + parágrafos. Seções não aprovadas recebem aviso amber.
- **Trigger automático**: `useRmaDocument.setStatus` calcula pct pós-transição; se ≥ 90% chama `regenerateFinal(false)` (não bloqueia UI).
- **Trigger manual**: botão "Regerar/Gerar agora" sempre passa `force=true`.
- **Storage**: bucket `rma-documents`, path `{rma_id}/{tipo}/{titulo}_v{N}.docx`, signed URL 30 dias.
- **Colunas em rma_documents**: `arquivo_final_url`, `arquivo_final_versao`, `arquivo_final_gerado_em`, `arquivo_final_pct`.
- **Status do doc**: vira `finalizado` quando pct=100, senão `pre_parecer`.
- **Função SQL**: `rma_document_progress(p_document_id)` retorna (total, ok, pct).
