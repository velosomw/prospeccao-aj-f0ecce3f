import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** ----- Types ----- */
export type MessageType =
  | "informativa"
  | "solicitacao_correcao"
  | "alerta_prazo"
  | "nao_conformidade"
  | "prospecção";

export type Priority = "baixa" | "media" | "alta" | "critica";

export type ConvStatus =
  | "aberta"
  | "em_analise"
  | "aguardando"
  | "em_correcao"
  | "resolvida"
  | "fechada"
  | "cancelada";

export interface Conversation {
  id: string;
  title: string | null;
  context_type: string | null;
  context_id: string | null;
  status: ConvStatus;
  priority: Priority;
  tags: string[];
  departamento: string | null;
  sla_hours: number | null;
  sla_due_at: string | null;
  created_by: string;
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  author_id: string;
  content: string;
  message_type: MessageType;
  priority: Priority;
  mentions: string[];
  assigned_to: string | null;
  metadata: Record<string, unknown>;
  attachment_url: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  priority: Priority;
  conversation_id: string | null;
  message_id: string | null;
  occurrence_id: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Occurrence {
  id: string;
  conversation_id: string | null;
  context_type: string | null;
  context_id: string | null;
  tipo: string;
  descricao: string;
  responsavel_id: string | null;
  prazo: string | null;
  status: string;
  prioridade: Priority;
  impacto: string | null;
  anexos: unknown[];
  created_by: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

/** ----- useConversations ----- */
export function useConversations() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false });
    setItems((data as Conversation[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("conversations-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { conversations: items, loading, refresh: load };
}

/** ----- useMessages ----- */
export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (alive) {
        setMessages((data as Message[]) ?? []);
        setLoading(false);
      }
    })();

    const ch = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as Message).id)
              ? prev
              : [...prev, payload.new as Message],
          );
        },
      )
      .subscribe();

    // marca notificações da conversa como lidas
    supabase.rpc("mark_conversation_notifications_read", {
      p_conversation_id: conversationId,
    });

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [conversationId]);

  const send = useCallback(
    async (
      content: string,
      opts?: {
        message_type?: MessageType;
        priority?: Priority;
        mentions?: string[];
      },
    ) => {
      const trimmed = content.trim();
      if (!conversationId || !trimmed) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        author_id: user.id,
        content: trimmed,
        message_type: opts?.message_type ?? "informativa",
        priority: opts?.priority ?? "baixa",
        mentions: opts?.mentions ?? [],
      });
    },
    [conversationId],
  );

  return { messages, loading, send };
}

/** ----- createConversation ----- */
export async function createConversation(input: {
  title?: string;
  contextType?: string;
  contextId?: string;
  priority?: Priority;
  slaHours?: number;
  tags?: string[];
  departamento?: string;
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      title: input.title ?? null,
      context_type: input.contextType ?? "geral",
      context_id: input.contextId ?? null,
      priority: input.priority ?? "media",
      sla_hours: input.slaHours ?? null,
      tags: input.tags ?? [],
      departamento: input.departamento ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  await supabase
    .from("conversation_participants")
    .insert({ conversation_id: data.id, user_id: user.id });
  return data.id;
}

/** ----- useNotifications ----- */
export function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as NotificationItem[]) ?? []);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    const ch = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems((prev) => [payload.new as NotificationItem, ...prev]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    load();
  }, [userId, load]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  return { notifications: items, unreadCount, markRead, markAllRead, refresh: load };
}

/** ----- useOccurrences (lista geral do usuário) ----- */
export function useOccurrences() {
  const [items, setItems] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("occurrences")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as Occurrence[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("occurrences-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "occurrences" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  return { occurrences: items, loading, refresh: load };
}

export async function createOccurrence(input: {
  conversationId?: string;
  contextType?: string;
  contextId?: string;
  tipo: string;
  descricao: string;
  responsavelId?: string;
  prazo?: string;
  prioridade?: Priority;
  impacto?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("occurrences")
    .insert({
      conversation_id: input.conversationId ?? null,
      context_type: input.contextType ?? null,
      context_id: input.contextId ?? null,
      tipo: input.tipo,
      descricao: input.descricao,
      responsavel_id: input.responsavelId ?? null,
      prazo: input.prazo ?? null,
      prioridade: input.prioridade ?? "media",
      impacto: input.impacto ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return null;
  return data?.id ?? null;
}
