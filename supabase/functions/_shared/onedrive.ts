// Shared helpers for OneDrive integration via Lovable Connector Gateway.
// Mode: Delegated OAuth (token managed by gateway).
// Enforces base_path restriction, allowed extensions, max file size,
// auto-folder creation and audit logging in pipeline_logs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { graphApp, getAppCreds, resolveShareUrl } from "./graph-app.ts";

// ─── Configuration (mirrors Gestor IA YAML in MD) ────────────
// Mapeamento código operacional → nome exibido no OneDrive.
// Os códigos (ENTRADAS, PROCESSANDO, ...) seguem sendo usados como chave
// programática estável; os valores são os nomes "amigáveis" criados na pasta
// "Projeto RMA" do OneDrive ("Entradas IA", "Processando IA", etc.).
export const OPERATIONAL_FOLDER_NAMES = {
  ENTRADAS: "Entradas IA",
  PROCESSANDO: "Processando IA",
  PROCESSADOS: "Processados IA",
  RELATORIOS: "Relatórios IA",
  AUDITORIA: "Auditoria IA",
  ERROS: "Erros IA",
} as const;

// Nomes legados criados antes da padronização "<...> IA". Usados para
// (a) renomear pastas existentes para o novo padrão e (b) ignorá-las ao
// listar tópicos do RMA (não confundir com pastas-tópico).
export const LEGACY_OPERATIONAL_FOLDER_NAMES: Record<OperationalFolder, string[]> = {
  ENTRADAS: ["ENTRADAS", "Entradas"],
  PROCESSANDO: ["PROCESSANDO", "Processando"],
  PROCESSADOS: ["PROCESSADOS", "Processados"],
  RELATORIOS: ["RELATORIOS", "RELATÓRIOS", "Relatorios", "Relatórios"],
  AUDITORIA: ["AUDITORIA", "Auditoria"],
  ERROS: ["ERROS", "Erros"],
};

export const ONEDRIVE_CONFIG = {
  base_path: "Projeto RMA",
  enforce_path_restriction: true,
  auto_create_folders: true,
  operational_subfolders: Object.values(OPERATIONAL_FOLDER_NAMES) as readonly string[],
  allowed_extensions: ["pdf", "docx", "xlsx", "xls", "png", "jpg", "jpeg", "csv", "txt"],
  max_file_size_bytes: 50 * 1024 * 1024, // 50 MB
};

export type OperationalFolder =
  | "ENTRADAS" | "PROCESSANDO" | "PROCESSADOS"
  | "RELATORIOS" | "AUDITORIA" | "ERROS";

// Conjunto canônico (novos + legados) usado para filtrar pastas operacionais
// no listing dos diretórios de período do RMA.
export const ALL_OPERATIONAL_FOLDER_NAMES: ReadonlySet<string> = new Set<string>([
  ...Object.values(OPERATIONAL_FOLDER_NAMES),
  ...Object.values(LEGACY_OPERATIONAL_FOLDER_NAMES).flat(),
]);

// ─── Credentials ──────────────────────────────────────────────
export function getCreds() {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const ONEDRIVE_KEY = Deno.env.get("MICROSOFT_ONEDRIVE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!ONEDRIVE_KEY) throw new Error("MICROSOFT_ONEDRIVE_API_KEY not configured (connector not linked)");
  return { LOVABLE_API_KEY, ONEDRIVE_KEY };
}

// ─── Path restriction guard ───────────────────────────────────
export function assertWithinBase(path: string) {
  if (!ONEDRIVE_CONFIG.enforce_path_restriction) return;
  const normalized = path.replace(/^\/+/, "").trim();
  if (!normalized.startsWith(ONEDRIVE_CONFIG.base_path)) {
    throw new Error(
      `Path restriction violation: '${path}' is outside base_path '${ONEDRIVE_CONFIG.base_path}'`
    );
  }
}

// ─── Filename validation & normalization ──────────────────────
export function isTempOrHiddenFile(name: string): boolean {
  if (!name) return true;
  const n = name.trim();
  if (n.startsWith("~$")) return true;        // Office lockfile
  if (n.startsWith(".~lock")) return true;    // LibreOffice
  if (n.startsWith("._")) return true;        // macOS resource fork
  if (n.toLowerCase() === ".ds_store") return true;
  if (n.toLowerCase() === "thumbs.db") return true;
  return false;
}

export function validateFile(name: string, sizeBytes: number) {
  if (isTempOrHiddenFile(name)) {
    throw new Error(`Arquivo temporário/oculto ignorado: '${name}'`);
  }
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (!ONEDRIVE_CONFIG.allowed_extensions.includes(ext)) {
    throw new Error(`Extensão '${ext}' não permitida (permitidas: ${ONEDRIVE_CONFIG.allowed_extensions.join(", ")})`);
  }
  if (sizeBytes > ONEDRIVE_CONFIG.max_file_size_bytes) {
    throw new Error(`Arquivo excede ${ONEDRIVE_CONFIG.max_file_size_bytes / 1024 / 1024}MB`);
  }
  return { ext };
}

export function buildStandardName(rmaId: string, tipo: string, ext: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `RMA_${rmaId}_${tipo.toUpperCase()}_${ts}.${ext}`;
}

// ─── Graph proxy (Application mode via graph-app.ts) ──────────
export async function graph<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return await graphApp<T>(path, init);
}

// ─── Resolve shared link to driveId/itemId ────────────────────
export async function resolveShareLink(shareUrl: string) {
  const r = await resolveShareUrl(shareUrl);
  return { driveId: r.driveId, itemId: r.itemId, name: r.name };
}

// ─── Resolve base folder in the configured user's drive ───────
export async function resolveBaseFolderInMyDrive() {
  const { userUpn } = getAppCreds();
  const path = encodeURIComponent(ONEDRIVE_CONFIG.base_path);
  const item = await graphApp<any>(`users/${encodeURIComponent(userUpn)}/drive/root:/${path}`);
  return {
    driveId: item.parentReference?.driveId,
    itemId: item.id,
    name: item.name,
  };
}

// ─── Smart resolver: prefer share link when fornecido (a pasta canônica
// vive no drive de outro usuário); my-drive só como fallback opcional.
export async function resolveRoot(shareUrl?: string) {
  if (shareUrl) {
    try {
      const shared = await resolveShareLink(shareUrl);
      if (shared.driveId && shared.itemId) {
        return { ...shared, source: "share_link" as const };
      }
    } catch (e) {
      console.warn("resolveShareLink failed, tentando my-drive:", (e as Error).message);
    }
  }
  try {
    const own = await resolveBaseFolderInMyDrive();
    if (own.driveId && own.itemId) return { ...own, source: "my_drive" as const };
  } catch (e) {
    if (!shareUrl) {
      throw new Error(
        `Pasta '${ONEDRIVE_CONFIG.base_path}' não encontrada no drive do usuário e nenhum shareUrl fornecido: ${(e as Error).message}`,
      );
    }
    throw new Error(
      `Pasta '${ONEDRIVE_CONFIG.base_path}' inacessível por share link e por my-drive: ${(e as Error).message}`,
    );
  }
  throw new Error(`Pasta '${ONEDRIVE_CONFIG.base_path}' não pôde ser resolvida`);
}

// ─── Folder navigation / auto-create ──────────────────────────
// Segue @odata.nextLink até esgotar a paginação. Sem isso, pastas com mais de
// ~200 itens (ou subpastas com paginação implícita do Graph) perderiam arquivos.
export async function listChildren(driveId: string, itemId: string) {
  const all: any[] = [];
  let url: string | null = `drives/${driveId}/items/${itemId}/children?$top=200`;
  let pages = 0;
  while (url && pages < 50) {
    const r: { value?: any[]; "@odata.nextLink"?: string } = await graph<any>(url);
    if (Array.isArray(r.value)) all.push(...r.value);
    const next = r["@odata.nextLink"];
    if (!next) break;
    // graph() prepende a base; aqui já temos URL absoluta → passamos como está.
    // O helper graph() suporta URL absoluta (https://...) sem reprefixar.
    url = next;
    pages++;
  }
  return all;
}

export async function findChildByName(driveId: string, parentId: string, name: string) {
  const children = await listChildren(driveId, parentId);
  const target = name.toLowerCase();
  return children.find((c) => (c.name ?? "").toLowerCase() === target) || null;
}

export async function ensureFolder(
  driveId: string,
  parentId: string,
  name: string,
): Promise<{ id: string; name: string; created: boolean }> {
  const existing = await findChildByName(driveId, parentId, name);
  if (existing) return { id: existing.id, name: existing.name, created: false };
  if (!ONEDRIVE_CONFIG.auto_create_folders) {
    throw new Error(`Pasta '${name}' não existe e auto_create_folders está desativado`);
  }
  try {
    const created = await graph<any>(`drives/${driveId}/items/${parentId}/children`, {
      method: "POST",
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    return { id: created.id, name: created.name, created: true };
  } catch (e) {
    // Race: pasta criada por outro request entre o list e o create.
    // Refaz lookup case-insensitive antes de propagar o erro.
    const msg = e instanceof Error ? e.message : String(e);
    if (/already exists|nameAlreadyExists|409/i.test(msg)) {
      const refetch = await listChildren(driveId, parentId);
      const match = refetch.find((c: any) =>
        c.folder && c.name?.toLowerCase() === name.toLowerCase()
      );
      if (match) return { id: match.id, name: match.name, created: false };
    }
    throw e;
  }
}

/**
 * Garante a existência das 6 subpastas operacionais com os novos nomes
 * ("Entradas IA", "Processando IA", etc.). Se uma pasta legada (ex.: "ENTRADAS",
 * "Entradas") existir, ela é renomeada in-place — preservando o id e os arquivos
 * já contidos. Se ambas existirem, mantém a nova e mescla os arquivos da legada.
 * Retorna um mapa { ENTRADAS: id, PROCESSANDO: id, ... }.
 */
export async function ensureOperationalSubfolders(
  driveId: string,
  parentId: string,
): Promise<Record<OperationalFolder, string>> {
  const map: Record<string, string> = {};
  const children = await listChildren(driveId, parentId);
  const codes = Object.keys(OPERATIONAL_FOLDER_NAMES) as OperationalFolder[];

  for (const code of codes) {
    const targetName = OPERATIONAL_FOLDER_NAMES[code];
    const legacyNames = LEGACY_OPERATIONAL_FOLDER_NAMES[code].map((n) => n.toLowerCase());
    const targetLower = targetName.toLowerCase();

    // 1) Já existe com o nome novo?
    const existingNew = children.find(
      (c: any) => c.folder && (c.name ?? "").toLowerCase() === targetLower,
    );
    // 2) Pastas legadas com o mesmo papel
    const existingLegacy = children.filter(
      (c: any) => c.folder && legacyNames.includes((c.name ?? "").toLowerCase()),
    );

    if (existingNew) {
      map[code] = existingNew.id;
      // Mescla arquivos das pastas legadas para a nova e remove as vazias.
      for (const legacy of existingLegacy) {
        try {
          const legacyFiles = await listChildren(driveId, legacy.id);
          for (const f of legacyFiles) {
            if (f.file) await moveItem(driveId, f.id, existingNew.id);
          }
          await graph(`drives/${driveId}/items/${legacy.id}`, { method: "DELETE" });
        } catch (e) {
          console.warn(`legacy folder cleanup failed (${legacy.name}):`, (e as Error).message);
        }
      }
      continue;
    }

    if (existingLegacy.length > 0) {
      // Renomeia a primeira legada para o nome novo (preserva id e arquivos).
      const primary = existingLegacy[0];
      try {
        await graph(`drives/${driveId}/items/${primary.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: targetName }),
        });
        map[code] = primary.id;
      } catch (e) {
        console.warn(`rename legacy folder failed (${primary.name} → ${targetName}):`, (e as Error).message);
        // Fallback: cria a pasta com o nome novo
        const f = await ensureFolder(driveId, parentId, targetName);
        map[code] = f.id;
      }
      // Mescla outras pastas legadas com o mesmo papel
      for (const legacy of existingLegacy.slice(1)) {
        try {
          const legacyFiles = await listChildren(driveId, legacy.id);
          for (const f of legacyFiles) {
            if (f.file) await moveItem(driveId, f.id, map[code]);
          }
          await graph(`drives/${driveId}/items/${legacy.id}`, { method: "DELETE" });
        } catch (e) {
          console.warn(`legacy folder cleanup failed (${legacy.name}):`, (e as Error).message);
        }
      }
      continue;
    }

    // 3) Nada existe — cria com o nome novo.
    const created = await ensureFolder(driveId, parentId, targetName);
    map[code] = created.id;
  }
  return map as Record<OperationalFolder, string>;
}

// ─── Move item between folders ────────────────────────────────
export async function moveItem(
  driveId: string,
  itemId: string,
  newParentId: string,
  newName?: string,
) {
  const body: any = { parentReference: { id: newParentId } };
  if (newName) body.name = newName;
  return await graph<any>(`drives/${driveId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ─── Audit log ────────────────────────────────────────────────
export interface AuditEntry {
  documentId: string | null;
  step: string;
  status: "success" | "error" | "info";
  durationMs?: number;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

export async function audit(entry: AuditEntry) {
  // pipeline_logs.document_id is NOT NULL — use a sentinel UUID for system-level events
  const SYSTEM_DOC = "00000000-0000-0000-0000-000000000000";
  try {
    const sb = getServiceClient();
    await sb.from("pipeline_logs").insert({
      document_id: entry.documentId ?? SYSTEM_DOC,
      step: entry.step,
      status: entry.status,
      duration_ms: entry.durationMs,
      error_message: entry.errorMessage,
      details: entry.details ?? null,
    });
  } catch (e) {
    console.error("audit insert failed", e);
  }
}
