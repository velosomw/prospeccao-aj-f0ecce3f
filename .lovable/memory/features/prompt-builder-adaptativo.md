---
name: Prompt Builder Adaptativo por Agente
description: Threshold/modelo/contexto dinâmico via agent_profiles + company_context, ajuste por OCR confidence, auto-degradação após erro
type: feature
---

# Prompt Builder Adaptativo (v3)

## Camadas
1. **agent_profiles** (PK agent_name) — temperature, max_tokens, similarity_threshold, max_examples, use_path_context, use_structured_context, strict_mode, priority_model (`flash-lite|flash|pro`).
2. **company_context** (company_id, chave, valor, scope) — memória factual da empresa, injetada no system prompt.
3. **Adaptação dinâmica em runtime** no `ai-prompt-builder`.

## Lógica adaptativa
- `threshold = profile.similarity_threshold`
  - −0.10 se `ocr_confidence < 0.7`
  - −0.05 para `AGENTE_BALANCETE`
  - clamp [0.30, 1]
- `top_k = body.top_k ?? profile.max_examples` (max 10)
- `recommended_model`:
  - `pro` se `ocr_confidence < 0.6` OU `priority_model='pro'`
  - senão usa `priority_model` mapeado em `MODEL_MAP` (Gemini 2.5 family)
- `strict_mode` adiciona regras anti-inferência ao prompt
- `use_path_context` controla se a Pasta entra no contexto
- `use_structured_context` exige JSON estruturado pelo schema do agente

## Auto-degradação
RPC `degrade_agent_profile_on_error(agent_name, step=0.05, extra_examples=2)`:
- threshold −0.05 (piso 0.40), max_examples +2 (teto 15)
- Permissão: gestor_ia / coordenador
- **Disparo automático**: `POST /ai-validate` chama essa RPC sempre que recebe `body.agent`, pois correção humana = sinal de erro.

## Endpoint
`POST /ai-prompt-builder` (action=build, default):
- Inputs novos: `ocr_confidence`, `company_id`, `context_scope`
- Outputs novos: `recommended_model`, `profile{...}`, `stats.ocr_confidence`, `stats.company_memory_count`

`POST /ai-prompt-builder?action=feedback` — `update_prompt_example_weight`
`POST /ai-prompt-builder?action=learn` — `learn_prompt_example`

## UI Gestor IA
Rota `/gestor-ia/perfil-agentes` (`GestorIAPerfilAgentes.tsx`) com 2 abas:
- **Perfis de Agente**: edita temperature, max_tokens, threshold, max_examples, modelo prioritário, strict/path/structured context
- **Memória da Empresa**: CRUD de `company_context` (escopo, chave, valor, peso) por empresa

## Seed inicial (13 perfis)
PIX/Boleto/Comprovante (flash-lite), Balancete/Extrato/DRE/Fluxo/Folha/Impostos (pro), Genérico (flash-lite, no strict).
