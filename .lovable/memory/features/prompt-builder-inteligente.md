---
name: Prompt Builder Inteligente
description: Few-shot dinâmico via embeddings Vertex AI 768D, ranking similarity*weight + path boost, telemetria (usage/success), peso adaptativo e learn-loop
type: feature
---

# Prompt Builder Inteligente (v2)

## Pipeline
OCR → normalize → embedding (Vertex AI 768D) → busca exemplos (classe + path) → rank → few-shot → agente → validador → feedback (atualiza peso) → learn (insere novo exemplo).

## Ranking
- `score = similarity * weight`. Peso vem de `prompt_examples.weight` (clamp [0.1, 5.0]).
- **Path boost**: pool extra via `search_prompt_examples_by_path`; +`PATH_BOOST` (0.15) no score quando casa.
- Mescla pools (classe + path), deduplica por id, ordena por score, top-K (default 5, max 10).
- Threshold default 0.7. Truncagem por exemplo: 600 chars.

## Telemetria de uso (v2)
Colunas em `prompt_examples`: `usage_count`, `success_count`, `last_used_at`. Permitem identificar exemplos quentes, com bom retorno e candidatos a revisão.

## Peso adaptativo (v2)
RPC `update_prompt_example_weight(example_id, success)`:
- success=true  → +0.1 e success_count++
- success=false → -0.2
- Clamp [0.1, 5.0]; sempre incrementa usage_count e atualiza last_used_at.
- Permissão: gestor_ia ou coordenador.

## Learn loop (v2)
RPC `learn_prompt_example(classe, input_text, output_json, validated_id?, agent?, weight=1.2)`:
- Insere exemplo novo já com peso boost (1.2).
- Trigger: humano valida correção no Gestor IA / Coordenador aprova RMA.
- Permissão: gestor_ia ou coordenador.

## RPCs disponíveis
- `search_prompt_examples` — base.
- `search_prompt_examples_by_path` — JOIN `dataset_validated` para path.
- `update_prompt_example_weight` — feedback após validação.
- `learn_prompt_example` — registra novo exemplo.

## Endpoints
- **ai-process** (`runAgent`): few-shot injetado no system prompt; retorna `examples_used` (com IDs).
- **ai-prompt-builder** — `POST { text, classe, path?, agent?, top_k?, threshold? }` → `{ prompt, system, user, examples[], stats }`.
- **ai-prompt-builder?action=feedback** — `POST { example_id, success }` → atualiza peso.
- **ai-prompt-builder?action=learn** — `POST { classe, input_text, output_json, validated_id?, agent?, weight? }` → registra exemplo.

## Limites
- top_k ≤ 10, exemplos ≤ 600 chars cada, texto OCR ≤ 4000 chars no user message → prompt < 8k tokens.
