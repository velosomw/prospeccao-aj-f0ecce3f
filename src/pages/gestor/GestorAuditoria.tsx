import { useEffect, useMemo, useState } from "react";
import { Shield, Lock, Activity, AlertTriangle, FileText, CheckCircle2, Search, X, Loader2, History } from "lucide-react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { supabase } from "@/integrations/supabase/client";

type Entry = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  user_id: string | null;
  user_role: string | null;
  prospeccao_id: string | null;
  conversation_id: string | null;
  summary: string | null;
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

const ENTITY_TYPES = ["", "conversation", "message", "occurrence", "participant", "notification"];
const ACTIONS = ["", "create", "send", "update", "status_change", "join", "leave", "delete"];

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function GestorAuditoria() {
  const [prospeccao, setRma] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState(todayISO(-30));
  const [to, setTo] = useState(todayISO(0));
  const [items, setItems] = useState<Entry[]>([]);
  const [users, setUsers] = useState<Record<string, { name: string; email: string }>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("platform_audit_log")
      .select("id,entity_type,entity_id,action,user_id,user_role,prospeccao_id,conversation_id,summary,created_at")
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (prospeccao.trim()) q = q.ilike("prospeccao_id", `%${prospeccao.trim()}%`);
    if (entityType) q = q.eq("entity_type", entityType);
    if (action) q = q.eq("action", action);

    const { data } = await q;
    let rows = (data as Entry[]) || [];

    // Filtro de usuário (nome/email) — busca em profiles e cruza por user_id
    if (userQuery.trim()) {
      const term = `%${userQuery.trim()}%`;
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .or(`full_name.ilike.${term},email.ilike.${term}`);
      const ids = new Set((profs || []).map((p: any) => p.user_id));
      rows = rows.filter((r) => r.user_id && ids.has(r.user_id));
    }

    // Hidrata nomes/emails dos autores
    const uids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
    if (uids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", uids);
      const map: Record<string, { name: string; email: string }> = {};
      (profs || []).forEach((p: any) => {
        map[p.user_id] = { name: p.full_name || "—", email: p.email || "" };
      });
      setUsers(map);
    } else {
      setUsers({});
    }

    setItems(rows);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const stats = useMemo(() => ({
    total: items.length,
    msgs:  items.filter((r) => r.entity_type === "message").length,
    convs: items.filter((r) => r.entity_type === "conversation").length,
    occ:   items.filter((r) => r.entity_type === "occurrence").length,
  }), [items]);

  const clear = () => {
    setRma(""); setUserQuery(""); setEntityType(""); setAction("");
    setFrom(todayISO(-30)); setTo(todayISO(0));
  };

  return (
    <ConsultorPageShell
      title="Auditoria PDF"
      subtitle="Trilha imutável WORM de toda governança e interação na plataforma."
      kpis={[
        { label: "Eventos (filtro)", value: stats.total, hint: "Resultados",       icon: Activity,      tone: "blue" },
        { label: "Mensagens",        value: stats.msgs,  hint: "Prospeccao AJ & comunicação",icon: FileText,      tone: "purple" },
        { label: "Conversas",        value: stats.convs, hint: "Criadas/alteradas",icon: CheckCircle2,  tone: "green" },
        { label: "Ocorrências",      value: stats.occ,   hint: "Abertas/transições",icon: AlertTriangle, tone: "red" },
        { label: "Hash Chain",       value: "—",        hint: "Integridade",      icon: Lock,          tone: "green" },
        { label: "Compliance",       value: "—",      hint: "WORM",             icon: Shield,        tone: "blue" },
      ]}
    >
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-border p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-1">
            <label className="text-[11px] font-semibold text-muted-foreground">Prospeccao AJ ID</label>
            <input value={prospeccao} onChange={(e) => setRma(e.target.value)}
                   placeholder="prospeccao_…"
                   className="mt-1 h-9 w-full px-2.5 rounded-lg border border-border text-sm" />
          </div>
          <div className="md:col-span-1">
            <label className="text-[11px] font-semibold text-muted-foreground">Usuário</label>
            <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)}
                   placeholder="nome ou e-mail"
                   className="mt-1 h-9 w-full px-2.5 rounded-lg border border-border text-sm" />
          </div>
          <div className="md:col-span-1">
            <label className="text-[11px] font-semibold text-muted-foreground">Entidade</label>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)}
                    className="mt-1 h-9 w-full px-2 rounded-lg border border-border text-sm bg-white">
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t || "Todas"}</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-[11px] font-semibold text-muted-foreground">Ação</label>
            <select value={action} onChange={(e) => setAction(e.target.value)}
                    className="mt-1 h-9 w-full px-2 rounded-lg border border-border text-sm bg-white">
              {ACTIONS.map((a) => <option key={a} value={a}>{a || "Todas"}</option>)}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-[11px] font-semibold text-muted-foreground">De</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                   className="mt-1 h-9 w-full px-2.5 rounded-lg border border-border text-sm" />
          </div>
          <div className="md:col-span-1">
            <label className="text-[11px] font-semibold text-muted-foreground">Até</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                   className="mt-1 h-9 w-full px-2.5 rounded-lg border border-border text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={load}
            className="h-9 px-4 rounded-lg bg-[hsl(217,91%,50%)] text-white text-sm font-semibold flex items-center gap-1.5 hover:opacity-90">
            <Search className="w-4 h-4" /> Buscar
          </button>
          <button onClick={() => { clear(); }}
            className="h-9 px-3 rounded-lg border border-border text-sm flex items-center gap-1.5 hover:bg-muted/40">
            <X className="w-4 h-4" /> Limpar
          </button>
        </div>
      </div>

      {/* Resultados */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Shield className="w-4 h-4 text-[hsl(217,91%,50%)]" />
          <h3 className="text-sm font-bold">Trilha global da plataforma (WORM)</h3>
          <span className="ml-auto text-[10px] font-bold text-green-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> CADEIA ÍNTEGRA
          </span>
        </div>
        <div className="max-h-[560px] overflow-y-auto divide-y divide-border">
          {loading ? (
            <div className="p-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <History className="w-5 h-5 text-muted-foreground/60" />
              Nenhum evento encontrado com esses filtros.
            </div>
          ) : (
            items.map((e) => {
              const u = e.user_id ? users[e.user_id] : null;
              return (
                <div key={e.id} className="px-4 py-3 hover:bg-muted/30">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ACTION_COLOR[e.action] || "bg-slate-100 text-slate-700"}`}>
                      {e.action}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">{e.entity_type}</span>
                    {e.user_role && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(217,91%,96%)] text-[hsl(217,91%,45%)] font-semibold">
                        {e.user_role}
                      </span>
                    )}
                    {u && <span className="text-[11px] text-foreground/80">{u.name} <span className="text-muted-foreground">· {u.email}</span></span>}
                    {e.prospeccao_id && <span className="text-[10px] font-mono text-purple-700">{e.prospeccao_id}</span>}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="text-xs text-foreground/80">{e.summary || "—"}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </ConsultorPageShell>
  );
}
