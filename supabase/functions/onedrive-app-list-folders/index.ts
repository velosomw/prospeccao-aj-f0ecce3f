// Lists subfolders of a given path under the configured user's OneDrive (Application mode).
// Defaults to "Projeto RMA". Supports pagination via $top and $skiptoken (nextLink).
//
// Request (POST JSON, all optional):
//   { path?: string, top?: number, nextLink?: string, foldersOnly?: boolean }
// Response:
//   { success, parent: { path, id, webUrl }, items: [{ id, name, webUrl, isFolder, childCount }],
//     nextLink: string | null, count }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { graphApp, getFolderByPath, getAppCreds } from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      path = "Projeto RMA",
      top = 50,
      nextLink,
      foldersOnly = true,
    }: { path?: string; top?: number; nextLink?: string; foldersOnly?: boolean } = body;

    const safeTop = Math.min(Math.max(Number(top) || 50, 1), 200);
    const { userUpn } = getAppCreds();

    // Resolve parent folder once (only when not paginating)
    let parent: { id: string; webUrl?: string; name: string } | null = null;
    let url: string;

    if (nextLink) {
      url = nextLink;
    } else {
      const folder = await getFolderByPath(path);
      parent = { id: folder.itemId, webUrl: folder.webUrl, name: folder.name };
      const select = "id,name,webUrl,folder,file,size,lastModifiedDateTime,parentReference";
      url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userUpn)}` +
            `/drive/items/${folder.itemId}/children` +
            `?$top=${safeTop}&$select=${select}&$orderby=name`;
    }

    const page = await graphApp<any>(url);
    const raw: any[] = page.value || [];
    const items = raw
      .filter((it) => (foldersOnly ? !!it.folder : true))
      .map((it) => ({
        id: it.id,
        name: it.name,
        webUrl: it.webUrl,
        isFolder: !!it.folder,
        childCount: it.folder?.childCount ?? null,
        size: it.size ?? null,
        lastModified: it.lastModifiedDateTime ?? null,
      }));

    return new Response(JSON.stringify({
      success: true,
      parent: parent ? { path, id: parent.id, name: parent.name, webUrl: parent.webUrl } : { path, paginated: true },
      items,
      count: items.length,
      nextLink: page["@odata.nextLink"] || null,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("onedrive-app-list-folders error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, null, 2), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
