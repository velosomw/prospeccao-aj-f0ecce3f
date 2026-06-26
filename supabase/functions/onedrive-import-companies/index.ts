// Importa empresas a partir das pastas em "Projeto RMA" no OneDrive (Application mode).
// Para cada subpasta de Projeto RMA cuja empresa AINDA não existe na tabela `companies`,
// cria um registro com source='onedrive' e rma_id no padrão RMA-YYYY-XXXX.
//
// Mantém os mocks/registros existentes — nada é apagado ou sobrescrito.
//
// Request (POST JSON, opcional):
//   { path?: string, dryRun?: boolean }
// Response:
//   { success, scanned, imported, skipped, items: [{ name, rma_id?, status, reason? }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { graphApp, getFolderByPath, getAppCreds } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

async function nextRmaId(sb: ReturnType<typeof svc>, year: number): Promise<string> {
  const prefix = `RMA-${year}-`;
  const { data } = await sb
    .from("companies")
    .select("rma_id")
    .like("rma_id", `${prefix}%`)
    .order("rma_id", { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data[0]?.rma_id) {
    const m = String(data[0].rma_id).match(/RMA-\d{4}-(\d+)/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { path = "Projeto RMA", dryRun = false }: { path?: string; dryRun?: boolean } = body;

    const { userUpn } = getAppCreds();
    const folder = await getFolderByPath(path);

    // Lista subpastas do path raiz
    const select = "id,name,webUrl,folder";
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userUpn)}` +
                `/drive/items/${folder.itemId}/children?$top=200&$select=${select}&$orderby=name`;
    const page = await graphApp<any>(url);
    const subfolders: any[] = (page.value || []).filter((it: any) => !!it.folder);

    const sb = svc();
    const { data: existing } = await sb.from("companies").select("id, name, rma_id");
    const byNorm = new Map<string, { id: string; name: string; rma_id: string | null }>();
    (existing || []).forEach((c: any) => byNorm.set(normalizeName(c.name), c));

    const year = new Date().getFullYear();
    const items: any[] = [];
    let imported = 0;
    let skipped = 0;

    for (const sf of subfolders) {
      const rawName = String(sf.name || "").trim();
      if (!rawName) continue;
      // Ignora pastas operacionais (legadas e novas com sufixo " IA")
      if (/^(ENTRADAS|PROCESSANDO|PROCESSADOS|RELATORIOS|RELATÓRIOS|AUDITORIA|ERROS|ARQUIVO|TEMP)$/i.test(rawName)) continue;
      if (/^(entradas|processando|processados|relatórios|relatorios|auditoria|erros)\s+ia$/i.test(rawName)) continue;

      const norm = normalizeName(rawName);
      const hit = byNorm.get(norm);
      if (hit) {
        items.push({ name: rawName, status: "skipped", reason: "já existe", existing_rma_id: hit.rma_id });
        skipped++;
        continue;
      }

      if (dryRun) {
        items.push({ name: rawName, status: "would_import" });
        continue;
      }

      const rma_id = await nextRmaId(sb, year);
      const { data: ins, error } = await sb.from("companies").insert({
        name: rawName,
        rma_id,
        source: "onedrive",
        status: "ativa",
        notes: `Importada do OneDrive em ${new Date().toISOString()} — pasta: ${path}/${rawName}`,
      }).select("id, rma_id").single();

      if (error) {
        items.push({ name: rawName, status: "error", reason: error.message });
        continue;
      }
      byNorm.set(norm, { id: ins!.id, name: rawName, rma_id: ins!.rma_id });
      items.push({ name: rawName, status: "imported", rma_id: ins!.rma_id, id: ins!.id });
      imported++;
    }

    return new Response(JSON.stringify({
      success: true,
      path,
      scanned: subfolders.length,
      imported,
      skipped,
      dryRun,
      items,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("onedrive-import-companies error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
