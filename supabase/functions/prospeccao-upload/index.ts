import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { 
  DATASET_CONFIGS, 
  DatasetType, 
  normalizeHeader, 
  reconcileBatch 
} from "../_shared/reconciliation-engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function detectDatasetType(headers: string[]): DatasetType | null {
  const normalizedHeaders = headers.map(normalizeHeader);
  
  // Scoring each dataset based on matching headers
  const scores: Record<string, number> = {};
  
  for (const [type, config] of Object.entries(DATASET_CONFIGS)) {
    let score = 0;
    const configHeaders = Object.keys(config.headerMap).map(normalizeHeader);
    for (const h of normalizedHeaders) {
      if (configHeaders.includes(h)) score++;
    }
    scores[type] = score;
  }

  // Find best score
  let bestType: DatasetType | null = null;
  let maxScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestType = type as DatasetType;
    }
  }

  // Threshold to avoid false positives
  return maxScore >= 3 ? bestType : null;
}

function parseExcelValue(v: any, type: string): any {
  if (v === null || v === undefined || v === "") return null;
  
  // Excel Serial Date check (Item 20)
  if (typeof v === "number" && (type === "date" || type === "datetime")) {
    // Basic Excel date to JS Date conversion
    const date = new Date(Math.round((v - 25569) * 86400 * 1000));
    return date.toISOString().split("T")[0];
  }

  if (v instanceof Date) {
    return v.toISOString().split("T")[0];
  }

  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Token inválido" }, 401);

    const body = await req.json();
    const { storage_path, file_name, file_type, dataset_type: forcedDatasetType } = body;
    
    if (!storage_path || !file_name || !file_type) {
      return json({ error: "Campos obrigatórios faltando" }, 400);
    }

    // Download file
    const { data: file, error: dlErr } = await supabase.storage.from("prospeccao-uploads").download(storage_path);
    if (dlErr) throw dlErr;
    
    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    
    // Get headers (Item 13: Detect header row)
    const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
    let headerRowIndex = 0;
    let headers: string[] = [];
    
    // Simple header detection: look for a row with at least 3 recognizable headers in the first 20 rows
    for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
      const row = jsonData[i];
      if (!row || !row.length) continue;
      
      const potentialHeaders = row.map(h => normalizeHeader(String(h || "")));
      const matches = potentialHeaders.filter(h => 
        Object.values(DATASET_CONFIGS).some(config => 
          Object.keys(config.headerMap).map(normalizeHeader).includes(h)
        )
      );
      
      if (matches.length >= 3) {
        headerRowIndex = i;
        headers = row.map(h => String(h || ""));
        break;
      }
    }

    if (!headers.length && jsonData.length > 0) {
      headers = jsonData[0].map(h => String(h || ""));
    }

    const datasetType = forcedDatasetType || detectDatasetType(headers);
    if (!datasetType) {
      return json({ error: "Não foi possível identificar o tipo de planilha. Verifique os cabeçalhos." }, 400);
    }

    const config = DATASET_CONFIGS[datasetType as DatasetType];
    
    // Create Import Batch
    const { data: batch, error: batchErr } = await supabase.from("spreadsheet_import_batches").insert({
      user_id: user.id,
      dataset_type: datasetType,
      file_name,
      file_size: buf.length,
      status: "processing"
    }).select().single();
    if (batchErr) throw batchErr;

    // Parse Rows
    const dataRows = XLSX.utils.sheet_to_json<any>(ws, { range: headerRowIndex, defval: null });
    const normalizedRows: any[] = [];
    
    for (const rawRow of dataRows) {
      const normalizedRow: any = {};
      let hasData = false;
      
      for (const [key, val] of Object.entries(rawRow)) {
        const mappedField = config.headerMap[normalizeHeader(key)];
        if (mappedField) {
          // Determine type for parsing (date, numeric, etc)
          let type = "text";
          if (mappedField.includes("data") || mappedField.includes("dt_")) type = "date";
          if (mappedField.includes("valor") || mappedField.includes("passivo")) type = "numeric";
          
          normalizedRow[mappedField] = parseExcelValue(val, type);
          if (val !== null && val !== "") hasData = true;
        }
      }
      
      if (hasData) normalizedRows.push(normalizedRow);
    }

    // Reconcile
    const results = await reconcileBatch(supabase, datasetType as DatasetType, normalizedRows, user.id, batch.id);

    // Update Batch status
    await supabase.from("spreadsheet_import_batches").update({
      status: "completed",
      rows_count: normalizedRows.length,
      inserted_count: results.inserted,
      updated_count: results.updated,
      unchanged_count: results.unchanged,
      conflict_count: results.conflicts,
      error_count: results.errors
    }).eq("id", batch.id);

    return json({
      ok: true,
      batch_id: batch.id,
      dataset_type: datasetType,
      results
    });

  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}