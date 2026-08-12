import { createClient } from "npm:@supabase/supabase-js@2";

export type DatasetType = "AJ_NOMEADOS" | "AGCS_REALIZADAS" | "CADASTRO_AJ" | "CARTAS_AJ";

export interface ReconciliationResult {
  inserted: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  errors: number;
}

export const DATASET_CONFIGS: Record<DatasetType, {
  tableName: string;
  businessKeyFields: string[];
  headerMap: Record<string, string>;
}> = {
  "AJ_NOMEADOS": {
    tableName: "prospeccao_aj_nomeados",
    businessKeyFields: ["numero_processo_normalizado", "empresa"],
    headerMap: {
      "data da distribuição": "data_distribuicao",
      "mês": "mes",
      "nº processo": "numero_processo",
      "n° processo": "numero_processo",
      "processo": "numero_processo",
      "empresa": "empresa",
      "vara e comarca": "vara_comarca",
      "estado": "estado",
      "uf": "estado",
      "valor do passivo": "valor_passivo",
      "aj nomeado": "aj_nomeado",
      "juiz / juíza": "juiz"
    }
  },
  "AGCS_REALIZADAS": {
    tableName: "prospeccao_agcs_realizadas",
    businessKeyFields: ["cliente", "recuperanda", "data_agc"],
    headerMap: {
      "cliente": "cliente",
      "recuperanda": "recuperanda",
      "data agc": "data_agc",
      "mês": "mes",
      "ano": "ano",
      "cidade": "cidade",
      "estado": "estado",
      "uf": "estado"
    }
  },
  "CADASTRO_AJ": {
    tableName: "prospeccao_cadastro_aj",
    businessKeyFields: ["cliente", "contato"],
    headerMap: {
      "clientes": "cliente",
      "cliente": "cliente",
      "sigla": "sigla",
      "contato": "contato",
      "endereço": "endereco",
      "número": "numero",
      "complemento": "complemento",
      "bairro": "bairro",
      "cidade": "cidade",
      "uf": "uf",
      "cep": "cep",
      "telefone": "telefone",
      "e-mail": "email",
      "email": "email"
    }
  },
  "CARTAS_AJ": {
    tableName: "prospeccao_cartas_aj",
    businessKeyFields: ["numero_processo_normalizado", "cliente", "data_distribuicao"],
    headerMap: {
      "data da distribuição": "data_distribuicao",
      "dia": "dia",
      "mês": "mes",
      "ano": "ano",
      "clientes": "cliente",
      "processo": "numero_processo",
      "90 dias": "data_90_dias",
      "120 dias": "data_120_dias",
      "150 dias": "data_150_dias",
      "sigla": "sigla",
      "contato": "contato",
      "status": "status",
      "data carta impressa": "data_carta_impressa"
    }
  }
};

export function normalizeHeader(h: string): string {
  return String(h || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeProcesso(p: string): string {
  return String(p || "").replace(/\D/g, "");
}

export function generateBusinessKey(dataset: DatasetType, row: any): string {
  const config = DATASET_CONFIGS[dataset];
  return config.businessKeyFields
    .map(f => String(row[f] || "").trim().toLowerCase())
    .join("|");
}

export async function reconcileBatch(
  supabase: any,
  dataset: DatasetType,
  rows: any[],
  userId: string,
  batchId: string
): Promise<ReconciliationResult> {
  const config = DATASET_CONFIGS[dataset];
  const results: ReconciliationResult = { inserted: 0, updated: 0, unchanged: 0, conflicts: 0, errors: 0 };

  for (const row of rows) {
    try {
      const bKey = generateBusinessKey(dataset, row);
      row.business_key = bKey;
      row.user_id = userId;
      row.import_batch_id = batchId;

      // Special handling for processo normalization
      if (row.numero_processo) {
        row.numero_processo_normalizado = normalizeProcesso(row.numero_processo);
      }

      // Check for existing record
      const { data: existing, error: fetchErr } = await supabase
        .from(config.tableName)
        .select("*")
        .eq("user_id", userId)
        .eq("business_key", bKey)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      if (!existing) {
        // INSERT
        const { error: insErr } = await supabase.from(config.tableName).insert(row);
        if (insErr) throw insErr;
        results.inserted++;
      } else {
        // RECONCILE (Item 23)
        const updates: Record<string, any> = {};
        const changes: any[] = [];
        let hasChanges = false;

        for (const [key, incomingValue] of Object.entries(row)) {
          // Skip internal fields
          if (["id", "created_at", "updated_at", "user_id", "import_batch_id", "business_key", "field_lineage"].includes(key)) continue;

          const existingValue = existing[key];

          // Logic: Excel preenchido + plataforma diferente -> atualizar (Item 3)
          if (incomingValue !== null && incomingValue !== undefined && incomingValue !== "" && incomingValue !== existingValue) {
            updates[key] = incomingValue;
            changes.push({
              field: key,
              old: existingValue,
              new: incomingValue
            });
            hasChanges = true;
          }
          // Excel vazio + plataforma preenchida -> preservar plataforma (Item 3)
          // No action needed, updates[key] will not be set.
        }

        if (hasChanges) {
          const { error: updErr } = await supabase
            .from(config.tableName)
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          
          if (updErr) throw updErr;

          // Log changes (Item 46)
          for (const change of changes) {
            await supabase.from("spreadsheet_change_log").insert({
              record_id: existing.id,
              batch_id: batchId,
              dataset_type: dataset,
              field_name: change.field,
              old_value: String(change.old || ""),
              new_value: String(change.new || ""),
              source_type: "SOURCE_EXCEL_UPLOAD",
              user_id: userId
            });
          }
          results.updated++;
        } else {
          results.unchanged++;
        }
      }
    } catch (e) {
      console.error(`Error reconciling row:`, e);
      results.errors++;
    }
  }

  return results;
}
