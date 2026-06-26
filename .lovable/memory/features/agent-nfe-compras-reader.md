---
name: Agent NFe Compras Reader v1
description: Agente especializado para Relação de Notas Fiscais de Compras — schema, pipeline, tabelas (nfe_compras, document_patterns), aprendizado por embeddings
type: feature
---

# Agente NF-e Compras Reader v1

## Objetivo
Ler documentos da pasta OneDrive `/Relação de Notas Fiscais de Compras` (PDF, XLSX, XLS, CSV, imagens), extrair cada nota como linha estruturada, validar e aprender continuamente com os layouts.

## Pipeline
1. **Ingestão**: OneDrive (já integrado, path monitorado).
2. **OCR**: Google Vision Document AI (`ocr-google-vision`). XLSX/CSV vão por SheetJS no client (`learningService`).
3. **Classificação**: heurística por path/header em `ai-process` → classe `NFE_COMPRAS`.
4. **Extração**: `AGENTE_NFE_COMPRAS_READER` (Gemini 2.5 Pro, classe crítica).
5. **Agregação**: chunks consolidam `notas[]` + recalcula `totais`.
6. **Validação**: validador genérico (Pro) compara JSON contra OCR.
7. **Persistência**: cada nota → tabela `nfe_compras` (helper `persistNfeCompras`).
8. **Aprendizado**: embeddings em `document_patterns` (RPC `match_document_pattern`) + few-shot via `prompt_examples` (loop existente).

## Schema canônico extraído (por nota)
```json
{
  "empresa": null, "cnpj": null,
  "fornecedor": null, "cnpj_fornecedor": null,
  "numero_nota": null, "serie": null, "chave_nfe": null,
  "data_emissao": "YYYY-MM-DD", "data_entrada": "YYYY-MM-DD",
  "valor_total": 0.0, "valor_produtos": 0.0, "valor_frete": 0.0, "valor_desconto": 0.0,
  "valor_icms": 0.0, "valor_ipi": 0.0, "valor_pis": 0.0, "valor_cofins": 0.0, "valor_st": 0.0,
  "cfop": null, "ncm": null, "natureza_operacao": null,
  "descricao": null, "categoria": null,
  "tipo": "compra",
  "linha_origem": 1, "warnings": []
}
```

## Tabelas
- `public.nfe_compras` — uma linha por nota, com `extraction_id`, `confidence_score`, `warnings`, RLS por papel (gestor_ia/coordenador full, consultor read).
- `public.document_patterns` — memória de layouts por empresa/fornecedor/tipo, `embedding vector(768)`, `weight`, `hits/successes`.
- RPC `match_document_pattern(query_embedding, target_tipo, target_company_id, threshold, count)` — cosine search ordenada por `similarity * weight`.

## Heurística de classificação (sem custo IA)
```
/Relação de Notas Fiscais de Compras/  →  NFE_COMPRAS
header "RELAÇÃO ... NOTAS FISCAIS ... COMPRAS" → NFE_COMPRAS
```

## Normalizações obrigatórias (server-side)
- Datas: `DD/MM/YYYY` → `YYYY-MM-DD`
- Valores: `"1.234,56"` → `1234.56`; parênteses → negativo
- CNPJ/CPF: apenas dígitos
- CFOP: 4 dígitos
- Linhas TOTAL/SUBTOTAL → descartadas

## Validações automáticas
- `data_emissao <= data_entrada`
- `valor_total > 0`
- `CNPJ` com 14 dígitos
- Anomalias entram em `warnings[]` mas a nota não é descartada.

## Modelos
- Extração: **Gemini 2.5 Pro** (incluído em `CRITICAL_CLASSES`).
- Validação: Gemini 2.5 Pro (padrão do validador).

## Conexões downstream
- Balancete (custos/estoque), DRE, Fluxo de Caixa, Endividamento.

## UI
- Validação humana via tela `GestorIAAprendizado` — classe `NFE_COMPRAS` listada no filtro.
- Correções → `dataset_validated` → `prompt_examples` (loop padrão).

## Arquivos chave
- `supabase/migrations/...nfe_compras + document_patterns`
- `supabase/functions/ai-process/index.ts` — classifier, agente, mergeExtractions, persistNfeCompras
- `src/lib/specializedAgents.ts` — `AGENTE_NFE_COMPRAS_READER`
- `src/pages/GestorIAAprendizado.tsx` — `CLASSES` inclui `NFE_COMPRAS`
