---
name: Prompt Builder MD
description: Camada complementar opt-in de prompt dinâmico (BASE+CONTEXTO+REGRAS+ERROS+EXEMPLOS) com loop de aprendizado contínuo
type: feature
---
Edge function `prompt-builder` (POST/GET) monta prompt final a partir de 6 blocos: base contábil sênior, contexto do doc, regras estruturais (A=P+PL), erros recorrentes (`prompt_erros`), aprendizado humano/auto (`prompt_learning`) e instrução final. Persiste em `prompt_versions` com hash dedup (incrementa used_count se mesmo hash).

Endpoints:
- POST /prompt-builder { classe, input_text, contexto?, persist? } → { prompt, components, prompt_hash, tokens_estimated, version_id }
- POST /prompt-builder?action=feedback → upsert prompt_learning (+frequencia)
- POST /prompt-builder?action=erro → upsert prompt_erros (+frequencia)
- GET /prompt-builder?action=preview&classe=...&input_text=... → preview sem persistir

Integração com `balancete-build` (opt-in via `use_smart_prompt: true`):
- ensureExtraction envia `extra_system_prompt` para ai-process com o prompt enriquecido
- Linhas que caem em `match.source === "fallback"` registram automaticamente um erro em `prompt_erros` (loop de aprendizado)

Tabelas: prompt_learning, prompt_erros, prompt_versions (RLS: gestor/coordenador gerenciam; autenticados leem ativos).
UI de Treinamento da IA: pendente (próxima iteração).
