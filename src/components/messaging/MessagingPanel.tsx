import { useEffect, useRef, useState } from "react";
import {
  MessageCircle, Send, Plus, Loader2, AlertTriangle, Clock,
  FileWarning, FileText, Inbox, Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useConversations, useMessages, createConversation,
  type MessageType, type Priority,
} from "@/hooks/useMessages";
import AuditTrail from "@/components/audit/AuditTrail";

const TYPE_META: Record<MessageType, { label: string; icon: any; bg: string; fg: string }> = {
  informativa:          { label: "Informativa",          icon: MessageCircle, bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)" },
  solicitacao_correcao: { label: "Solicitação Correção", icon: FileWarning,   bg: "hsl(38,95%,95%)",  fg: "hsl(32,90%,45%)"  },
  alerta_prazo:         { label: "Alerta de Prazo",      icon: Clock,         bg: "hsl(18,90%,95%)",  fg: "hsl(18,85%,50%)"  },
  nao_conformidade:     { label: "Não Conformidade",     icon: AlertTriangle, bg: "hsl(0,84%,96%)",   fg: "hsl(0,84%,50%)"   },
  rma:                  { label: "Prospecção AJ",                  icon: FileText,      bg: "hsl(258,90%,96%)", fg: "hsl(258,75%,55%)" },
};

const PRIO_META: Record<Priority, { label: string; cls: string }> = {
  baixa:   { label: "Baixa",    cls: "bg-slate-100 text-slate-700" },
  media:   { label: "Média",    cls: "bg-blue-100 text-blue-700" },
  alta:    { label: "Alta",     cls: "bg-amber-100 text-amber-700" },
  critica: { label: "Crítica",  cls: "bg-red-100 text-red-700" },
};

export default function MessagingPanel() {
  const { conversations, loading: loadingConvs } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [msgType, setMsgType] = useState<MessageType>("informativa");
  const [priority, setPriority] = useState<Priority>("baixa");
  const [showAudit, setShowAudit] = useState(false);
  const { messages, loading, send } = useMessages(activeId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!activeId && conversations[0]) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleNew = async () => {
    const title = window.prompt("Título da nova conversa:");
    if (!title) return;
    const id = await createConversation({
      title,
      contextType: "geral",
      priority: "media",
      slaHours: 48,
    });
    if (id) setActiveId(id);
  };

  const handleSend = async () => {
    if (!draft.trim()) return;
    await send(draft, { message_type: msgType, priority });
    setDraft("");
    setMsgType("informativa");
    setPriority("baixa");
  };

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden grid grid-cols-1 md:grid-cols-[300px_1fr] h-[640px]">
      {/* Lista */}
      <aside className="border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold">Conversas</h3>
          <button
            onClick={handleNew}
            className="w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] text-white flex items-center justify-center hover:opacity-90"
            title="Nova conversa"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <Inbox className="w-6 h-6 text-muted-foreground/60" />
              Nenhuma conversa ainda. Clique em <strong>+</strong> para iniciar.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/40 transition ${
                  activeId === c.id ? "bg-[hsl(217,91%,96%)]" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[hsl(217,91%,92%)] text-[hsl(217,91%,50%)] flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {c.title || "Sem título"}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded ${PRIO_META[c.priority]?.cls || ""}`}>
                        {PRIO_META[c.priority]?.label}
                      </span>
                      <span>· {c.status}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Mensagens */}
      <section className="flex flex-col min-w-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold truncate">
              {active?.title || "Mensagens"}
            </h3>
            {active && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                <span className={`px-1.5 py-0.5 rounded ${PRIO_META[active.priority]?.cls || ""}`}>
                  {PRIO_META[active.priority]?.label}
                </span>
                <span>· {active.context_type || "geral"}</span>
                {active.sla_due_at && (
                  <span>· SLA até {new Date(active.sla_due_at).toLocaleDateString("pt-BR")}</span>
                )}
              </div>
            )}
          </div>
          {activeId && (
            <button
              onClick={() => setShowAudit((v) => !v)}
              className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border ${
                showAudit
                  ? "bg-[hsl(217,91%,50%)] text-white border-transparent"
                  : "bg-white text-[hsl(217,91%,45%)] border-border hover:bg-muted/40"
              }`}
              title="Trilha de auditoria desta conversa"
            >
              <Shield className="w-3.5 h-3.5" />
              Trilha
            </button>
          )}
        </div>

        {showAudit && activeId && (
          <div className="border-b border-border p-3 bg-muted/20">
            <AuditTrail
              conversationId={activeId}
              title="Trilha desta conversa"
              limit={100}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[hsl(220,20%,98%)]">
          {!activeId ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Selecione ou crie uma conversa.
            </div>
          ) : loading ? (
            <div className="flex justify-center pt-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Nenhuma mensagem ainda — diga olá!
            </div>
          ) : (
            messages.map((m) => {
              const self = m.author_id === userId;
              const t = TYPE_META[m.message_type] || TYPE_META.informativa;
              const TIcon = t.icon;
              return (
                <div key={m.id} className={`flex ${self ? "justify-end" : ""}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
                      self
                        ? "bg-[hsl(217,91%,50%)] text-white"
                        : "bg-white border border-border"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={
                          self
                            ? { background: "rgba(255,255,255,.2)", color: "white" }
                            : { background: t.bg, color: t.fg }
                        }
                      >
                        <TIcon className="w-3 h-3" />
                        {t.label}
                      </span>
                      {m.priority !== "baixa" && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            self ? "bg-white/20 text-white" : PRIO_META[m.priority]?.cls
                          }`}
                        >
                          {PRIO_META[m.priority]?.label}
                        </span>
                      )}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                    <div className={`text-[10px] mt-1 ${self ? "text-white/70" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={msgType}
              onChange={(e) => setMsgType(e.target.value as MessageType)}
              disabled={!activeId}
              className="h-8 px-2 rounded border border-border bg-white text-xs disabled:opacity-50"
            >
              {Object.entries(TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              disabled={!activeId}
              className="h-8 px-2 rounded border border-border bg-white text-xs disabled:opacity-50"
            >
              {Object.entries(PRIO_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={!activeId}
              placeholder={activeId ? "Digite uma mensagem..." : "Selecione uma conversa"}
              className="flex-1 h-10 px-3 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(217,91%,50%)]/30 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!activeId || !draft.trim()}
              className="h-10 px-4 rounded-lg bg-[hsl(217,91%,50%)] text-white text-sm font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
