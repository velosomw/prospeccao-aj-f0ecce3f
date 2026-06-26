import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, History, CheckCircle, Ban, User, Clock, AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  fileId: string | null;
  fileName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AuditEntry {
  id: string;
  created_at: string;
  user_id: string | null;
  user_role: string | null;
  action: string;
  reason: string | null;
  attempt_number: number | null;
  max_attempts: number | null;
  metadata?: any;
}

const roleLabel = (r?: string | null) => {
  switch (r) {
    case "gestor_ia": return "Gestor IA";
    case "coordenador": return "Coordenador";
    case "magistrado": return "Magistrado";
    case "consultor": return "Consultor";
    case "recuperanda": return "Recuperanda";
    case "admjudicial": return "Adm. Judicial";
    default: return r || "—";
  }
};

const reasonLabel = (r?: string | null) => {
  switch (r) {
    case "manual_reprocess": return "Reprocessamento manual";
    case "gestor_bypass": return "Bypass do Gestor IA (limite excedido)";
    case "max_reprocess_reached": return "Limite máximo de tentativas atingido";
    default: return r || "—";
  }
};

type FilterKey = "all" | "allowed" | "blocked";

export default function ReprocessHistoryDialog({ fileId, fileName, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !fileId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("reprocess_audit_log")
        .select("id,created_at,user_id,user_role,action,reason,attempt_number,max_attempts,metadata")
        .eq("file_id", fileId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const list = (data || []) as AuditEntry[];
      setEntries(list);
      const ids = Array.from(new Set(list.map((e) => e.user_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,email,full_name")
          .in("user_id", ids);
        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => {
          map[p.user_id] = p.full_name || p.email || p.user_id;
        });
        if (!cancelled) setEmails(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, fileId, reloadKey]);

  const counts = useMemo(() => {
    const allowed = entries.filter((e) => e.action === "allowed").length;
    const blocked = entries.filter((e) => e.action === "blocked").length;
    return { all: entries.length, allowed, blocked };
  }, [entries]);

  const lastAttempt = entries[0];
  const maxAttempts = lastAttempt?.max_attempts ?? null;
  const usedAttempts = entries.filter((e) => e.action === "allowed").length;
  const remaining = maxAttempts != null ? Math.max(0, maxAttempts - usedAttempts) : null;

  const visible = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.action === filter);
  }, [entries, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <History className="w-4 h-4" />
                Histórico de auditoria — Reprocessamentos
              </DialogTitle>
              {fileName && <p className="text-xs text-muted-foreground truncate mt-1">{fileName}</p>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setReloadKey((k) => k + 1)}
              title="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Atualizar
            </Button>
          </div>
        </DialogHeader>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-muted-foreground">Total</div>
            <div className="text-lg font-semibold">{counts.all}</div>
          </div>
          <div className="rounded-md border bg-[hsl(142,76%,36%)]/10 p-2">
            <div className="text-[hsl(142,76%,36%)]">Permitidas</div>
            <div className="text-lg font-semibold text-[hsl(142,76%,36%)]">{counts.allowed}</div>
          </div>
          <div className="rounded-md border bg-[hsl(0,84%,60%)]/10 p-2">
            <div className="text-[hsl(0,84%,60%)]">Bloqueadas</div>
            <div className="text-lg font-semibold text-[hsl(0,84%,60%)]">{counts.blocked}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="text-muted-foreground">Restantes</div>
            <div className="text-lg font-semibold">
              {remaining != null ? remaining : "—"}
              {maxAttempts != null && (
                <span className="text-xs text-muted-foreground font-normal"> / {maxAttempts}</span>
              )}
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 text-xs">
          {(["all", "allowed", "blocked"] as FilterKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                filter === k
                  ? "bg-[hsl(217,91%,50%)] text-white border-[hsl(217,91%,50%)]"
                  : "bg-background hover:bg-muted border-border text-muted-foreground"
              }`}
            >
              {k === "all" ? "Todas" : k === "allowed" ? "Permitidas" : "Bloqueadas"}
              <span className="ml-1 opacity-70">
                ({k === "all" ? counts.all : k === "allowed" ? counts.allowed : counts.blocked})
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {entries.length === 0
              ? "Nenhuma tentativa registrada para este arquivo."
              : "Nenhum registro neste filtro."}
          </p>
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {visible.map((e) => {
              const isBlocked = e.action === "blocked";
              return (
                <div
                  key={e.id}
                  className={`border rounded-md p-3 text-xs space-y-2 ${
                    isBlocked
                      ? "border-[hsl(0,84%,60%)]/30 bg-[hsl(0,84%,60%)]/5"
                      : "border-[hsl(142,76%,36%)]/30 bg-[hsl(142,76%,36%)]/5"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isBlocked ? (
                      <Badge className="bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-0">
                        <Ban className="w-3 h-3 mr-1" />Bloqueada
                      </Badge>
                    ) : (
                      <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-0">
                        <CheckCircle className="w-3 h-3 mr-1" />Permitida
                      </Badge>
                    )}
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {new Date(e.created_at).toLocaleString("pt-BR")}
                    </span>
                    {e.attempt_number != null && (
                      <span className="ml-auto text-muted-foreground">
                        Tentativa {e.attempt_number}
                        {e.max_attempts ? ` / ${e.max_attempts}` : ""}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Usuário:</span>
                      <span className="font-medium truncate">
                        {e.user_id ? (emails[e.user_id] || e.user_id) : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Perfil: </span>
                      <span className="font-medium">{roleLabel(e.user_role)}</span>
                    </div>
                  </div>

                  <div className={`flex items-start gap-1.5 ${isBlocked ? "text-[hsl(0,84%,60%)]" : ""}`}>
                    {isBlocked && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                    <div>
                      <span className="text-muted-foreground">
                        {isBlocked ? "Motivo do bloqueio: " : "Motivo: "}
                      </span>
                      <span className="font-medium">{reasonLabel(e.reason)}</span>
                    </div>
                  </div>

                  {e.metadata && (e.metadata.queue_id || e.metadata.path) && (
                    <div className="text-[10px] text-muted-foreground border-t pt-1.5 space-y-0.5">
                      {e.metadata.queue_id && (
                        <div>Job: <span className="font-mono">{String(e.metadata.queue_id).slice(0, 8)}…</span></div>
                      )}
                      {e.metadata.path && (
                        <div className="truncate" title={e.metadata.path}>Pasta: {e.metadata.path}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
