// Lists subfolders of "Projeto RMA" and creates/updates companies with sequential RMA IDs.
// Numbering scheme: RMA-{YEAR}-{####} (default year = current year), alphabetical by folder name.
// Conflict policy: if a company with the same name exists, UPDATE its rma_id to the new sequence.
// Otherwise, INSERT a new company with name = folder name and rma_id = generated.
//
// Request (POST JSON, all optional):
//   { path?: string, year?: number, prefix?: string, dryRun?: boolean }
// Response:
//   { success, year, prefix, totalFolders, items: [{ folderName, rmaId, action, companyId, webUrl }] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { graphApp, getFolderByPath, getAppCreds } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const {
      path = "Projeto RMA",
      year = new Date().getFullYear(),
      prefix = "RMA",
      dryRun = false,
    }: { path?: string; year?: number; prefix?: string; dryRun?: boolean } = body;

    // Auth: identify caller (used as created_by when inserting)
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const callerId = userData?.user?.id || null;

    const admin = createClient(supabaseUrl, serviceKey);

    // 1) List subfolders of "Projeto RMA" (paginated, foldersOnly)
    const { userUpn } = getAppCreds();
    const root = await getFolderByPath(path);
    const select = "id,name,webUrl,folder";
    let url: string | null =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userUpn)}` +
      `/drive/items/${root.itemId}/children?$top=200&$select=${select}&$orderby=name`;

    const folders: { id: string; name: string; webUrl: string }[] = [];
    while (url) {
      const page: any = await graphApp(url);
      for (const it of page.value || []) {
        if (it.folder) folders.push({ id: it.id, name: it.name, webUrl: it.webUrl });
      }
      url = page["@odata.nextLink"] || null;
    }

    // Sort alphabetically (case-insensitive) for stable numbering
    folders.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

    // 2) For each folder: assign RMA-{year}-{####}, upsert company by name
    const items: Array<{
      folderName: string;
      rmaId: string;
      action: "inserted" | "updated" | "skipped" | "dry-run";
      companyId: string | null;
      webUrl: string;
    }> = [];

    let seq = 0;
    for (const f of folders) {
      seq += 1;
      const rmaId = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;

      if (dryRun) {
        items.push({ folderName: f.name, rmaId, action: "dry-run", companyId: null, webUrl: f.webUrl });
        continue;
      }

      // Find existing by name (case-insensitive exact)
      const { data: existing } = await admin
        .from("companies")
        .select("id, name, rma_id")
        .ilike("name", f.name)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error: upErr } = await admin
          .from("companies")
          .update({ rma_id: rmaId, source: "onedrive", updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (upErr) throw upErr;
        items.push({ folderName: f.name, rmaId, action: "updated", companyId: existing.id, webUrl: f.webUrl });
      } else {
        const { data: inserted, error: insErr } = await admin
          .from("companies")
          .insert({
            name: f.name,
            rma_id: rmaId,
            source: "onedrive",
            status: "ativa",
            payment_status: "em_dia",
            created_by: callerId,
            notes: `Importado de OneDrive: ${f.webUrl}`,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        items.push({ folderName: f.name, rmaId, action: "inserted", companyId: inserted.id, webUrl: f.webUrl });
      }
    }

    // Audit log
    await admin.from("pipeline_logs").insert({
      document_id: "00000000-0000-0000-0000-000000000000",
      step: "onedrive_renumber_rmas",
      status: "success",
      duration_ms: Date.now() - startedAt,
      details: { path, year, prefix, totalFolders: folders.length, dryRun, callerId },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({
      success: true,
      year, prefix, path,
      totalFolders: folders.length,
      items,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("onedrive-renumber-rmas error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, null, 2), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
