---
name: Memória Semântica por Empresa
description: 3 camadas (fatos/embeddings/regras) + captura automática no ai-validate + injeção no ai-prompt-builder
type: feature
---

# Memória Semântica por Empresa (v1)

## Camadas
1. **company_context** (já existia) — fatos estruturados (chave/valor/scope/weight).
2. **company_memory_embeddings** — vetor 768D (ivfflat cosine) com tipo (regra|padrao|comportamento|erro|contexto_documento), conteudo, weight, source.
3. **company_rules** — regras textuais com tipo (geral|classificacao|conta|fornecedor|banco), prioridade 1-10, ativa.

## Funções SQL
- `match_company_memory(query_embedding, target_company_id, threshold=0.65, count=5)` — ranking por `(1-cos) * weight`.
- `reinforce_company_memory(memory_id, success)` — ±delta no weight (clamp 0.1..5.0), gestor/coordenador.

## Captura automática (ai-validate)
Quando recebe `body.company_id`:
- Insere em `company_memory_embeddings` com embedding já gerado (weight 1.2, source='ai-validate').
- Extrai fatos do `output_correto` (banco, fornecedor, beneficiario, pagador, conta, imposto) e upserta em `company_context`.

## Injeção no prompt (ai-prompt-builder)
Carrega em paralelo: agent_profile, company_context, **company_memory** (RPC), **company_rules** (ativa=true). Adiciona blocos:
- `CONTEXTO DA EMPRESA (fatos validados)` — top 12 do company_context
- `MEMÓRIA SEMÂNTICA DA EMPRESA` — top 5 trechos do RAG
- `REGRAS ESPECÍFICAS DA EMPRESA` — top 15 regras ativas (ordenadas por prioridade)

Stats novas: `semantic_memory_count`, `rules_count`.

## UI
`/gestor-ia/perfil-agentes` ganhou 4 abas: Perfis · Fatos da Empresa · **Memória Semântica** · **Regras de Negócio** (CRUD + toggle ativa/inativa).
