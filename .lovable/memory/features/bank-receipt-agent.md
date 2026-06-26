---
name: Bank Receipt Agent
description: Agente especializado para comprovantes bancários corporativos (TED/DOC/Transferência) com pré-classificação heurística por header
type: feature
---

# AGENTE_BANK_RECEIPT

Edge function: `supabase/functions/ai-process/index.ts`.

## Classe nova
- Enum `Classe` adiciona `BANK_RECEIPT` (entre `DRE` e `OUTRO`).
- `agentMap.BANK_RECEIPT = "AGENTE_BANK_RECEIPT"`.

## Heurística de pré-classificação (`heuristicClassify`)
Roda ANTES do classifier IA → economiza ~1 chamada Flash-Lite por documento quando bate.
Regras (regex sobre primeiros 1500 chars):
- `bradesco net empresa | itau empresas | santander net/empresarial | sicoob empresarial | caixa empresa` → `BANK_RECEIPT`
- `comprovante de transferência/TED/DOC/pagamento a fornecedor/débito automático` → `BANK_RECEIPT`
- Token `pix` no header tem precedência → `PIX`
- `pix realizado/enviado/recebido` → `PIX`
- `linha digitável|código de barras` + `boleto|cobrança` → `BOLETO`
- `balancete de verificação|balanço patrimonial` → `BALANCETE`
- `demonstração do/de resultado|DRE` → `DRE`
- Pasta `/comprovantes/` + tokens bancários → `BANK_RECEIPT`

Quando heurística bate: `confianca = 0.95`, motivo prefixado com `heurística:`.

## Schema do agente
```json
{
  "tipo_operacao": "TED|DOC|PIX|TRANSFERENCIA|PAGAMENTO_FORNECEDOR|DEBITO_AUTOMATICO",
  "valor": number, "data": "YYYY-MM-DD", "hora": "HH:MM",
  "banco_emissor": string,
  "pagador":   { "nome", "cnpj", "agencia", "conta" },
  "favorecido":{ "nome", "cpf_cnpj", "banco", "agencia", "conta" },
  "id_transacao": string,
  "finalidade": string,
  "parte_relacionada": boolean,
  "alertas": string[],
  "confianca": number
}
```

## Regras de extração
- Limpar hashes de autenticação longos e rodapés de SAC/Ouvidoria antes de pesar tokens.
- `parte_relacionada=true` quando favorecido for sócio/administrador/empresa do mesmo grupo (cruza com agente societário).
- Modelo padrão: Flash-Lite (não-crítico).
