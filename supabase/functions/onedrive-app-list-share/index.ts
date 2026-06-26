// Lists subfolders inside a OneDrive/SharePoint share URL (Application mode).
// Resolves the share URL → driveId + itemId, then optionally navigates into a
// relative subpath, then lists children with paginação.
//
// Request (POST JSON):
//   {
//     shareUrl: string,           // required: the SharePoint/OneDrive share URL
//     subPath?: string,           // optional: e.g. "CLIENTE/2026/03.2026"
//     top?: number,               // 1-200, default 50
//     nextLink?: string,          // for pagination (use value from previous response)
//     foldersOnly?: boolean       // default true
//   }
// Response:
//   { success, parent: {name,id,webUrl,driveId,subPath}, items, count, nextLink }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  graphApp,
  resolveShareUrl,
  getChildByRelativePath,
} from "../_shared/graph-app.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      shareUrl,
      subPath,
      top = 50,
      nextLink,
      foldersOnly = true,
    }: {
      shareUrl?: string;
      subPath?: string;
      top?: number;
      nextLink?: string;
      foldersOnly?: boolean;
    } = body;

    if (!nextLink && !shareUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: "shareUrl is required (or pass nextLink to continue pagination)",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const safeTop = Math.min(Math.max(Number(top) || 50, 1), 200);

    let parent: { driveId: string; itemId: string; name: string; webUrl: string; subPath?: string } | null = null;
    let url: string;

    if (nextLink) {
      url = nextLink;
    } else {
      // 1. Resolve share URL
      const root = await resolveShareUrl(shareUrl!);
      if (!root.isFolder) {
        return new Response(JSON.stringify({
          success: false,
          error: `Share URL points to a file ('${root.name}'), not a folder`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 2. Optionally navigate into subPath
      let cursor = { driveId: root.driveId, itemId: root.itemId, name: root.name, webUrl: root.webUrl };
      if (subPath && subPath.trim()) {
        cursor = await getChildByRelativePath(root.driveId, root.itemId, subPath.trim());
      }
      parent = { ...cursor, subPath };

      const select = "id,name,webUrl,folder,file,size,lastModifiedDateTime,parentReference";
      url = `https://graph.microsoft.com/v1.0/drives/${cursor.driveId}/items/${cursor.itemId}/children` +
            `?$top=${safeTop}&$select=${select}&$orderby=name`;
    }

    // 3. Fetch page
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
      parent,
      items,
      count: items.length,
      nextLink: page["@odata.nextLink"] || null,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("onedrive-app-list-share error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, null, 2), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
