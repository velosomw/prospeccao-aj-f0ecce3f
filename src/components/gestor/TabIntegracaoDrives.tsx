import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Cloud, HardDrive, Mail, FolderOpen, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Shield, Settings,
  Link2, Database, Clock, FileText, Inbox, PlayCircle, Loader2,
  ShieldCheck, FileCheck2, History,
  Plug, Plus, Globe, Webhook, CreditCard, Upload,
} from "lucide-react";

type EdgeDiagnosticPayload = {
  success: boolean;
  error?: string;
  hint?: string;
  category?: string;
  graphStatus?: number;
  graphCode?: string;
  endpoint?: string;
  tokenType?: string;
  actions?: string[];
  data?: any;
  summary?: any;
  checks?: any[];
  env?: Record<string, boolean>;
};

const isStructuredEdgeError = (value: unknown): value is EdgeDiagnosticPayload => {
  if (!value || typeof value !== "object") return false;
  return "success" in value && "error" in value;
};

const normalizeInvokeError = (data: any, error: any): EdgeDiagnosticPayload | null => {
  if (isStructuredEdgeError(data)) return data;
  if (isStructuredEdgeError(error?.context)) return error.context;
  return null;
};

const renderActions = (actions?: string[]) => {
  if (!actions?.length) return null;
  return (
    <ul className="space-y-1 pl-4 list-disc text-xs text-foreground/80">
      {actions.map((action) => (
        <li key={action}>{action}</li>
      ))}
    </ul>
  );
};

// ─── Config that mirrors supabase/functions/_shared/onedrive.ts ───
const ONEDRIVE_CONFIG = {
  base_path: "Projeto RMA",
  enforce_path_restriction: true,
  auto_create_folders: true,
  operational_subfolders: ["ENTRADAS", "PROCESSANDO", "PROCESSADOS", "RELATORIOS", "AUDITORIA", "ERROS"],
  allowed_extensions: ["pdf", "docx", "xlsx", "xls", "png", "jpg", "jpeg", "csv", "txt"],
  max_file_size_mb: 50,
  share_url: "https://bexonedrive-my.sharepoint.com/:f:/g/personal/tecnico_brasilexpert_com_br/IgA6tcBZSKW9Qq9kqTMlHODwAWn9lmWTkQNwh_kj1yOvzxA",
  account: "projetorma@brasilexpert.com.br",
};

// ─── Provider Icon ─────────────────────────────────────────────
const ProviderIcon = ({ provider, size = "md" }: { provider: "google" | "microsoft"; size?: "sm" | "md" | "lg" }) => {
  const sizes = { sm: "w-5 h-5", md: "w-8 h-8", lg: "w-10 h-10" };
  const colors = { google: "text-[hsl(4,90%,58%)]", microsoft: "text-[hsl(207,90%,54%)]" };
  const bgColors = { google: "bg-[hsl(4,90%,58%)]/10", microsoft: "bg-[hsl(207,90%,54%)]/10" };
  return (
    <div className={`${sizes[size]} rounded-lg ${bgColors[provider]} flex items-center justify-center`}>
      <Cloud className={`${size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4"} ${colors[provider]}`} />
    </div>
  );
};

const StatusBadge = ({ status }: { status: "connected" | "disconnected" | "error" | "checking" }) => {
  const map = {
    connected: { label: "Conectado", color: "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] border-[hsl(152,70%,45%)]/30", icon: <CheckCircle2 className="w-3 h-3" /> },
    disconnected: { label: "Desconectado", color: "bg-muted text-muted-foreground border-border", icon: <XCircle className="w-3 h-3" /> },
    error: { label: "Erro", color: "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)] border-[hsl(0,70%,55%)]/30", icon: <AlertTriangle className="w-3 h-3" /> },
    checking: { label: "Verificando…", color: "bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)] border-[hsl(38,90%,55%)]/30", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  };
  const c = map[status];
  return <Badge variant="outline" className={`${c.color} gap-1 text-xs font-semibold`}>{c.icon} {c.label}</Badge>;
};

// ─── OneDrive (Microsoft) — real connector card ───────────────
const OneDriveCard = () => {
  const [status, setStatus] = useState<"connected" | "disconnected" | "error" | "checking">("checking");
  const [accountInfo, setAccountInfo] = useState<{ name?: string; mail?: string } | null>(null);
  const [errorInfo, setErrorInfo] = useState<EdgeDiagnosticPayload | null>(null);

  const verify = async () => {
    setStatus("checking");
    setErrorInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke("onedrive-list", {
        body: { path: "me", method: "GET" },
      });
      const structuredError = normalizeInvokeError(data, error);
      if (structuredError) {
        setAccountInfo(null);
        setStatus("error");
        setErrorInfo(structuredError);
        return;
      }

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha ao consultar /me");
      setAccountInfo({ name: data.data?.displayName, mail: data.data?.mail || data.data?.userPrincipalName });
      setStatus("connected");
    } catch (e: any) {
      setAccountInfo(null);
      setStatus("error");
      setErrorInfo({ success: false, error: e?.message || String(e), tokenType: "app" });
    }
  };

  useEffect(() => { verify(); }, []);

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4" style={{ borderTopWidth: 3, borderTopColor: "hsl(207,90%,54%)" }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <ProviderIcon provider="microsoft" size="lg" />
          <div>
            <div className="font-semibold text-sm text-foreground">Microsoft OneDrive</div>
            <div className="text-xs text-muted-foreground">{ONEDRIVE_CONFIG.account}</div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-muted/50 rounded-lg p-2.5">
          <div className="text-muted-foreground mb-1">Modo</div>
          <div className="font-semibold flex items-center gap-1">
            <Shield className="w-3 h-3" /> App token
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5">
          <div className="text-muted-foreground mb-1">Gateway</div>
          <div className="font-semibold flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Microsoft Graph
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5">
          <div className="text-muted-foreground mb-1">Conta detectada</div>
          <div className="font-semibold truncate">{accountInfo?.mail || "—"}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5">
          <div className="text-muted-foreground mb-1">Display name</div>
          <div className="font-semibold truncate">{accountInfo?.name || "—"}</div>
        </div>
      </div>

      {errorInfo && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-xs text-destructive flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div className="font-semibold mb-1">Falha na verificação</div>
            <div className="font-mono break-all">{errorInfo.error}</div>
            {errorInfo.hint && <div className="text-foreground/80">{errorInfo.hint}</div>}
            <div className="flex flex-wrap gap-2 text-[11px]">
              {errorInfo.graphStatus && <Badge variant="outline">HTTP {errorInfo.graphStatus}</Badge>}
              {errorInfo.tokenType && <Badge variant="outline">token: {errorInfo.tokenType}</Badge>}
              {errorInfo.category && <Badge variant="outline">{errorInfo.category}</Badge>}
            </div>
            {errorInfo.endpoint && (
              <code className="block rounded bg-muted/50 px-2 py-1 break-all text-[10px] text-muted-foreground">{errorInfo.endpoint}</code>
            )}
            {renderActions(errorInfo.actions)}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={verify}>
          <RefreshCw className="w-3 h-3" /> Verificar credenciais
        </Button>
      </div>
    </div>
  );
};

// ─── Sync controls (calls onedrive-sync-rma) ───────────────────
const SyncControls = () => {
  const [rmaId, setRmaId] = useState("RMA-001");
  const [clientFolder, setClientFolder] = useState("GERATHERM");
  const [year, setYear] = useState("2026");
  const [period, setPeriod] = useState("02.2026");
  const [ensureSubfolders, setEnsureSubfolders] = useState(true);
  const [persist, setPersist] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async (mode: "sync" | "poll") => {
    setRunning(true);
    setResult(null);
    try {
      const fn = mode === "sync" ? "onedrive-sync-rma" : "onedrive-poll-entradas";
      const { data, error } = await supabase.functions.invoke(fn, {
        body: {
          rmaId,
          shareUrl: ONEDRIVE_CONFIG.share_url,
          clientFolder: clientFolder || undefined,
          year, period,
          ensureSubfolders,
          persist,
        },
      });
      const structuredError = normalizeInvokeError(data, error);
      if (structuredError) {
        setResult(structuredError);
        toast.error(structuredError.hint || structuredError.error || "Falha na integração com Microsoft Graph");
        return;
      }

      if (error) throw error;
      setResult(data);
      if (data?.success) toast.success(mode === "sync" ? "Sincronização concluída" : "Polling concluído");
      else toast.error(data?.error || "Falha");
    } catch (e: any) {
      toast.error(e?.message || String(e));
      setResult({ success: false, error: e?.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <PlayCircle className="w-4 h-4 text-[hsl(258,90%,66%)]" />
        <h3 className="text-sm font-bold text-foreground">Sincronização & Polling</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Prospecção AJ ID</Label>
          <Input className="h-9 text-sm" value={rmaId} onChange={e => setRmaId(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cliente (pasta)</Label>
          <Input className="h-9 text-sm" value={clientFolder} onChange={e => setClientFolder(e.target.value)} placeholder="GERATHERM" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ano</Label>
          <Input className="h-9 text-sm" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Período</Label>
          <Input className="h-9 text-sm" value={period} onChange={e => setPeriod(e.target.value)} placeholder="02.2026" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={ensureSubfolders} onCheckedChange={setEnsureSubfolders} />
          Auto-criar subpastas operacionais
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={persist} onCheckedChange={setPersist} />
          Persistir em <code className="bg-muted px-1 rounded">pipeline_documents</code>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5 bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white" onClick={() => run("sync")} disabled={running}>
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Sincronizar tópicos
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run("poll")} disabled={running}>
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Inbox className="w-3.5 h-3.5" />}
          Processar /ENTRADAS
        </Button>
      </div>

      {result && (
        <pre className="bg-muted/40 rounded-lg p-3 text-[11px] overflow-auto max-h-72 font-mono">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
};

// ─── Diagnostics: per-endpoint Graph health + token type ──────
const DiagnosticsCard = () => {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [includeShare, setIncludeShare] = useState(true);

  const run = async () => {
    setRunning(true);
    setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("onedrive-diagnostics", {
        body: includeShare ? { shareUrl: ONEDRIVE_CONFIG.share_url } : {},
      });
      const structuredError = normalizeInvokeError(data, error);
      if (structuredError) {
        setReport(structuredError);
        toast.error(structuredError.hint || structuredError.error || "Falha ao rodar diagnóstico");
        return;
      }

      if (error) throw error;
      setReport(data);
      const failed = data?.summary?.failed ?? 0;
      if (failed === 0) toast.success("Todos os endpoints OK");
      else toast.warning(`${failed} endpoint(s) com falha`);
    } catch (e: any) {
      toast.error(e?.message || String(e));
      setReport({ success: false, error: e?.message });
    } finally {
      setRunning(false);
    }
  };

  const statusPill = (c: any) => {
    const isExpectedFail = c.step === "me_should_fail";
    if (isExpectedFail) {
      return c.ok
        ? <Badge variant="outline" className="bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)] border-[hsl(38,90%,55%)]/30 text-[10px]">inesperado OK</Badge>
        : <Badge variant="outline" className="bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] border-[hsl(152,70%,45%)]/30 text-[10px]">esperado 401</Badge>;
    }
    return c.ok
      ? <Badge variant="outline" className="bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] border-[hsl(152,70%,45%)]/30 text-[10px]">OK {c.status}</Badge>
      : <Badge variant="outline" className="bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)] border-[hsl(0,70%,55%)]/30 text-[10px]">FAIL {c.status || "—"}</Badge>;
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4" style={{ borderTopWidth: 3, borderTopColor: "hsl(207,90%,54%)" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[hsl(207,90%,54%)]" />
          <h3 className="text-sm font-bold text-foreground">Diagnóstico OneDrive / Microsoft Graph</h3>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">token: app (client_credentials)</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Testa cada endpoint usado pelo sync (token Azure AD, <code className="bg-muted px-1 rounded">/users/{"{upn}"}</code>,
        drive, base path e link de compartilhamento) e mostra status HTTP, mensagem e dica de correção.
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={includeShare} onCheckedChange={setIncludeShare} id="diag-share" />
          <Label htmlFor="diag-share" className="text-xs">Testar shareUrl</Label>
        </div>
        <Button size="sm" onClick={run} disabled={running} className="gap-2">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
          Rodar diagnóstico
        </Button>
      </div>

      {report?.env && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-[11px] font-semibold text-muted-foreground mb-2">Secrets configurados</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(report.env).map(([k, v]) => (
              <Badge key={k} variant="outline" className={`text-[10px] font-mono ${v ? "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] border-[hsl(152,70%,45%)]/30" : "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)] border-[hsl(0,70%,55%)]/30"}`}>
                {v ? "✓" : "✗"} {k}
              </Badge>
            ))}
          </div>
          {report.summary?.upn && (
            <div className="mt-2 text-[11px] text-muted-foreground">
              UPN: <code className="bg-background px-1 rounded">{report.summary.upn}</code>
            </div>
          )}
        </div>
      )}

      {report?.checks && (
        <div className="space-y-2">
          {report.checks.map((c: any, i: number) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {statusPill(c)}
                  <span className="text-xs font-semibold text-foreground truncate">{c.step}</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">{c.durationMs}ms</span>
              </div>
              <code className="block text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded break-all">{c.endpoint}</code>
              {c.message && (
                <div className="text-[11px] text-foreground/80"><span className="font-semibold">msg:</span> {c.message}</div>
              )}
              {c.hint && (
                <div className="text-[11px] text-[hsl(217,91%,50%)]"><span className="font-semibold">💡 dica:</span> {c.hint}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {report?.error && !report.checks && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-2">
          <div>{report.error}</div>
          {report.hint && <div className="text-foreground/80">{report.hint}</div>}
          {renderActions(report.actions)}
        </div>
      )}
    </div>
  );
};

// ─── Renumber existing RMAs from OneDrive folders ─────────────
const RenumberRMAsCard = () => {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [prefix, setPrefix] = useState("RMA");
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("onedrive-renumber-rmas", {
        body: { path: ONEDRIVE_CONFIG.base_path, year: Number(year), prefix, dryRun },
      });
      if (error) throw error;
      setResult(data);
      if (data?.success) {
        toast.success(
          dryRun
            ? `Pré-visualização: ${data.totalFolders} pastas`
            : `${data.totalFolders} RMAs sincronizados`
        );
      } else {
        toast.error(data?.error || "Falha na renumeração");
      }
    } catch (e: any) {
      toast.error(e?.message || String(e));
      setResult({ success: false, error: e?.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4" style={{ borderTopWidth: 3, borderTopColor: "hsl(258,90%,66%)" }}>
      <div className="flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-[hsl(258,90%,66%)]" />
        <h3 className="text-sm font-bold text-foreground">Renumerar Prospecções AJ existentes (OneDrive → Banco)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Lê cada subpasta direta de <code className="bg-muted px-1 rounded">/{ONEDRIVE_CONFIG.base_path}</code>,
        atribui IDs sequenciais no formato <code className="bg-muted px-1 rounded">{prefix}-{year}-0001…</code> em ordem
        alfabética e cadastra/atualiza a empresa correspondente. Conflitos por nome <strong>atualizam</strong> o <code className="bg-muted px-1 rounded">rma_id</code>.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Prefixo</Label>
          <Input className="h-9 text-sm" value={prefix} onChange={e => setPrefix(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ano</Label>
          <Input className="h-9 text-sm" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="space-y-1 col-span-2 flex items-end">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
            Modo simulação (não grava no banco)
          </label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5 bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,90%,56%)] text-white"
          onClick={run}
          disabled={running}
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {dryRun ? "Pré-visualizar" : "Sincronizar e renumerar"}
        </Button>
      </div>

      {result?.success && Array.isArray(result.items) && (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">#</th>
                <th className="text-left px-3 py-2 font-semibold">Pasta OneDrive</th>
                <th className="text-left px-3 py-2 font-semibold">Prospecção AJ ID</th>
                <th className="text-left px-3 py-2 font-semibold">Ação</th>
                <th className="text-left px-3 py-2 font-semibold">Link</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((it: any, idx: number) => (
                <tr key={idx} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium">{it.folderName}</td>
                  <td className="px-3 py-2 font-mono">{it.rmaId}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-[10px] ${
                      it.action === "inserted" ? "text-[hsl(152,70%,45%)] border-[hsl(152,70%,45%)]/30" :
                      it.action === "updated" ? "text-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)]/30" :
                      it.action === "dry-run" ? "text-[hsl(38,90%,55%)] border-[hsl(38,90%,55%)]/30" :
                      "text-muted-foreground"
                    }`}>
                      {it.action}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {it.webUrl && (
                      <a href={it.webUrl} target="_blank" rel="noreferrer" className="text-[hsl(217,91%,50%)] hover:underline">
                        abrir
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && !result.success && (
        <div className="bg-[hsl(0,70%,55%)]/5 border border-[hsl(0,70%,55%)]/20 rounded-lg p-3 text-xs text-[hsl(0,70%,45%)]">
          {result.error}
        </div>
      )}
    </div>
  );
};

// ─── Rules card (mirrors MD) ──────────────────────────────────
const RulesCard = () => (
  <div className="bg-card rounded-xl border border-border p-5 space-y-4">
    <div className="flex items-center gap-2">
      <ShieldCheck className="w-4 h-4 text-[hsl(258,90%,66%)]" />
      <h3 className="text-sm font-bold text-foreground">Regras de Operação (MD)</h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <FolderOpen className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
          <div>
            <div className="font-semibold">Restrição de path</div>
            <div className="text-muted-foreground">
              Operações exclusivamente dentro de
              <code className="ml-1 bg-muted px-1 rounded">/{ONEDRIVE_CONFIG.base_path}</code>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Database className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
          <div>
            <div className="font-semibold">Estrutura híbrida</div>
            <div className="text-muted-foreground font-mono">
              /Projeto RMA/&#123;CLIENTE&#125;/&#123;ANO&#125;/&#123;PERIODO&#125;/&#123;{ONEDRIVE_CONFIG.operational_subfolders.join(",")}&#125;
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <FileCheck2 className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
          <div>
            <div className="font-semibold">Validação de arquivos</div>
            <div className="text-muted-foreground">
              Extensões: {ONEDRIVE_CONFIG.allowed_extensions.join(", ")}<br />
              Tamanho máximo: {ONEDRIVE_CONFIG.max_file_size_mb} MB
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-[hsl(152,70%,45%)]" />
          <div>
            <div className="font-semibold">Auto-criação de pastas</div>
            <div className="text-muted-foreground">Habilitado — subpastas faltantes são criadas no sync</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <History className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
          <div>
            <div className="font-semibold">Auditoria</div>
            <div className="text-muted-foreground">
              Toda operação registra evento em <code className="bg-muted px-1 rounded">pipeline_logs</code> (step, status, duração, detalhes)
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <RefreshCw className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
          <div>
            <div className="font-semibold">Polling</div>
            <div className="text-muted-foreground">
              <code className="bg-muted px-1 rounded">onedrive-poll-entradas</code> processa /ENTRADAS,
              move válidos para /PROCESSANDO e inválidos para /ERROS
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ─── Audit logs (real, from pipeline_logs) ────────────────────
const AuditLogsTable = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pipeline_logs")
      .select("id, step, status, duration_ms, error_message, details, created_at")
      .in("step", [
        "onedrive_sync_rma", "onedrive_poll_entradas",
        "onedrive_poll_move", "onedrive_poll_invalid",
      ])
      .order("created_at", { ascending: false })
      .limit(50);
    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[hsl(258,90%,66%)]" />
          <h3 className="text-sm font-bold">Auditoria — pipeline_logs</h3>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={load}>
          <RefreshCw className="w-3 h-3" /> Atualizar
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b border-border">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Quando</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Step</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Duração</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">Carregando…</td></tr>
          )}
          {!loading && logs.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">Sem eventos registrados</td></tr>
          )}
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 align-top">
              <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(log.created_at).toLocaleString("pt-BR")}
              </td>
              <td className="px-4 py-2.5 text-xs font-mono">{log.step}</td>
              <td className="px-4 py-2.5">
                <Badge variant="outline" className={`text-[10px] ${log.status === "success" ? "text-[hsl(152,70%,45%)] border-[hsl(152,70%,45%)]/30" : log.status === "error" ? "text-[hsl(0,70%,55%)] border-[hsl(0,70%,55%)]/30" : "text-muted-foreground"}`}>
                  {log.status === "success" ? "✓" : log.status === "error" ? "✗" : "•"} {log.status}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-xs font-mono">
                {log.duration_ms != null ? `${log.duration_ms} ms` : "—"}
              </td>
              <td className="px-4 py-2.5 text-[11px] font-mono text-muted-foreground max-w-md truncate">
                {log.error_message || (log.details ? JSON.stringify(log.details) : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Google Drive placeholder (per MD evolution: multi-cloud) ─
const GoogleDriveCard = () => (
  <div className="bg-card rounded-xl border border-border p-5 space-y-3" style={{ borderTopWidth: 3, borderTopColor: "hsl(4,90%,58%)" }}>
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <ProviderIcon provider="google" size="lg" />
        <div>
          <div className="font-semibold text-sm text-foreground">Google Drive</div>
          <div className="text-xs text-muted-foreground">Não conectado</div>
        </div>
      </div>
      <StatusBadge status="disconnected" />
    </div>
    <p className="text-xs text-muted-foreground">
      Multi-cloud (OneDrive + Google Drive) está previsto na seção <strong>Evoluções Futuras</strong> do MD.
      A conexão pode ser ativada via Connectors quando for adotada.
    </p>
  </div>
);

// ─── Outras Integrações (BigQuery, APIs, Webhooks, SFTP) ──────
const OUTRAS_INTEGRACOES = [
  { name: "BigQuery", type: "Data Warehouse", status: "active", icon: Database },
  { name: "API Contábil", type: "ERP", status: "active", icon: Globe },
  { name: "Webhooks", type: "Notificações", status: "active", icon: Webhook },
  { name: "API Financeira", type: "Banking", status: "inactive", icon: CreditCard },
  { name: "Upload SFTP", type: "Arquivos", status: "paused", icon: Upload },
] as const;

const otherStatusStyles: Record<string, { label: string; className: string }> = {
  active: { label: "Ativo", className: "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]" },
  inactive: { label: "Inativo", className: "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]" },
  paused: { label: "Pausado", className: "bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)]" },
};

const OutrasIntegracoesCard = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-bold text-foreground">Outras Integrações</h3>
        <p className="text-xs text-muted-foreground">Gerencie conexões com ERPs, APIs financeiras, BigQuery, webhooks e SFTP.</p>
      </div>
      <Button size="sm" className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Nova Integração
      </Button>
    </div>
    <div className="grid gap-3">
      {OUTRAS_INTEGRACOES.map((integ) => {
        const Icon = integ.icon;
        const style = otherStatusStyles[integ.status];
        return (
          <div key={integ.name} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-[hsl(258,90%,66%)]/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-[hsl(258,90%,66%)]" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-foreground">{integ.name}</h4>
                <p className="text-xs text-muted-foreground">{integ.type}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${style.className}`}>{style.label}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="w-4 h-4" /></Button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────
const TabIntegracaoDrives = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] flex items-center justify-center hover:bg-[hsl(217,91%,40%)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div>
            <h2 className="text-lg font-bold font-serif text-foreground">Integração Drives & E-mail</h2>
            <p className="text-xs text-muted-foreground">
              OneDrive corporativo via Connector (modo Delegated) — base_path <code className="bg-muted px-1 rounded">/{ONEDRIVE_CONFIG.base_path}</code>
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="connections">
        <TabsList className="bg-card border border-border h-auto p-1">
          <TabsTrigger value="connections" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <Link2 className="w-3.5 h-3.5" /> Conexões
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <ShieldCheck className="w-3.5 h-3.5" /> Regras
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Sync & Polling
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <FileText className="w-3.5 h-3.5" /> Auditoria
          </TabsTrigger>
          <TabsTrigger value="outras" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <Plug className="w-3.5 h-3.5" /> Outras Integrações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-4 mt-4">
          <OneDriveCard />
          <GoogleDriveCard />
        </TabsContent>

        <TabsContent value="rules" className="space-y-4 mt-4">
          <RulesCard />
        </TabsContent>

        <TabsContent value="sync" className="space-y-4 mt-4">
          <DiagnosticsCard />
          <RenumberRMAsCard />
          <SyncControls />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <AuditLogsTable />
        </TabsContent>

        <TabsContent value="outras" className="space-y-4 mt-4">
          <OutrasIntegracoesCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TabIntegracaoDrives;
