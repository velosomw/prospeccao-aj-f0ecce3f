import { useEffect, useState } from "react";
import { Shield, Loader2, History } from "lucide-react";
import { supabase } from "@/lib/supabase-any";

type Entry = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  user_id: string | null;
  user_role: string | null;
  summary: string | null;
  metadata: any;
  created_at: string;
};

const ACTION_COLOR: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  send: "bg-blue-100 text-blue-700",
  update: "bg-amber-100 text-amber-700",
  status_change: "bg-purple-100 text-purple-700",
  join: "bg-teal-100 text-teal-700",
  leave: "bg-slate-100 text-slate-700",
  delete: "bg-red-100 text-red-700",
};

interface Props {
  conversationId?: string | null;
  prospeccaoId?: string | null;
  entityId?: string | null;
  limit?: number;
  title?: string;
}

export default function AuditTrail({
  conversationId, prospeccaoId, entityId, limit = 50,
  title = "Trilha de Auditoria",
}: Props) {
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      let q = supabase
        .from("platform_audit_log")
        .select("id,entity_type,entity_id,action,user_id,user_role,summary,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (conversationId) q = q.eq("conversation_id", conversationId);
      if (prospeccaoId) q = q.eq("prospeccao_id", prospeccaoId);
      if (entityId) q = q.eq("entity_id", entityId);
      const { data } = await q;
      if (active) {
        setItems((data as Entry[]) || []);
        setLoading(false);
      }
    };
    load();

    // realtime
    const ch = supabase
      .channel(`audit-${conversationId || prospeccaoId || entityId || "global"}`)
      .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "platform_audit_log" },
          (payload) => {
            const row = payload.new as Entry;
            if (conversationId && (row as any).conversation_id !== conversationId) return;
            if (prospeccaoId && (row as any).prospeccao_id !== prospeccaoId) return;
            if (entityId && row.entity_id !== entityId) return;
            setItems((prev) => [row, ...prev].slice(0, limit));
          })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [conversationId, prospeccaoId, entityId, limit]);

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Shield className="w-4 h-4 text-[hsl(217,91%,50%)]" />
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="ml-auto text-[10px] font-bold text-green-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> WORM
        </span>
      </div>
      <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
        {loading ? (
          <div className="p-6 flex justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground/60" />
            Nenhum evento registrado.
          </div>
        ) : (
          items.map((e) => (
            <div key={e.id} className="px-4 py-3 hover:bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ACTION_COLOR[e.action] || "bg-slate-100 text-slate-700"}`}>
                  {e.action}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">{e.entity_type}</span>
                {e.user_role && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(217,91%,96%)] text-[hsl(217,91%,45%)] font-semibold">
                    {e.user_role}
                  </span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="text-xs text-foreground/80">{e.summary || "—"}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
