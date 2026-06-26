
-- ============= 1) Estende conversations e messages =============
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aberta',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS departamento TEXT,
  ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id);

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'informativa',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'baixa',
  ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_conversations_status ON public.conversations(status);
CREATE INDEX IF NOT EXISTS idx_messages_assigned ON public.messages(assigned_to);

-- ============= 2) message_attachments =============
CREATE TABLE public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_att_message ON public.message_attachments(message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read attachments" ON public.message_attachments
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.messages m
           WHERE m.id = message_id
             AND public.is_conversation_participant(m.conversation_id, auth.uid()))
);
CREATE POLICY "Author manages own attachments" ON public.message_attachments
FOR ALL TO authenticated
USING (uploaded_by = auth.uid())
WITH CHECK (uploaded_by = auth.uid());

-- ============= 3) message_reads (auditoria) =============
CREATE TABLE public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip TEXT,
  user_agent TEXT,
  UNIQUE (message_id, user_id)
);
CREATE INDEX idx_msg_reads_user ON public.message_reads(user_id);
GRANT SELECT, INSERT ON public.message_reads TO authenticated;
GRANT ALL ON public.message_reads TO service_role;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read read-receipts" ON public.message_reads
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.messages m
           WHERE m.id = message_id
             AND public.is_conversation_participant(m.conversation_id, auth.uid()))
);
CREATE POLICY "User records own read" ON public.message_reads
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============= 4) occurrences =============
CREATE TABLE public.occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  context_type TEXT,
  context_id UUID,
  tipo TEXT NOT NULL, -- nao_conformidade | pendencia | bloqueio | sla | outro
  descricao TEXT NOT NULL,
  responsavel_id UUID REFERENCES auth.users(id),
  prazo TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'aberta', -- aberta|em_analise|aguardando|em_correcao|resolvida|fechada|cancelada
  prioridade TEXT NOT NULL DEFAULT 'media', -- baixa|media|alta|critica
  impacto TEXT,
  anexos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_occ_status ON public.occurrences(status);
CREATE INDEX idx_occ_responsavel ON public.occurrences(responsavel_id);
CREATE INDEX idx_occ_context ON public.occurrences(context_type, context_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.occurrences TO authenticated;
GRANT ALL ON public.occurrences TO service_role;
ALTER TABLE public.occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read occurrences I can see" ON public.occurrences
FOR SELECT TO authenticated USING (
  created_by = auth.uid()
  OR responsavel_id = auth.uid()
  OR (conversation_id IS NOT NULL
      AND public.is_conversation_participant(conversation_id, auth.uid()))
  OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
  OR public.has_role(auth.uid(), 'coordenador'::app_role)
);
CREATE POLICY "Authenticated create occurrence" ON public.occurrences
FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Owner/responsavel/coord updates" ON public.occurrences
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid() OR responsavel_id = auth.uid()
  OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
  OR public.has_role(auth.uid(), 'coordenador'::app_role)
)
WITH CHECK (
  created_by = auth.uid() OR responsavel_id = auth.uid()
  OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
  OR public.has_role(auth.uid(), 'coordenador'::app_role)
);
CREATE POLICY "Creator/coord deletes" ON public.occurrences
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'gestor_ia'::app_role)
  OR public.has_role(auth.uid(), 'coordenador'::app_role)
);

CREATE TRIGGER trg_occurrences_updated_at
BEFORE UPDATE ON public.occurrences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= 5) notifications =============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- nova_mensagem | mencao | ocorrencia | prazo | mudanca_status | aprovacao | rma
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT NOT NULL DEFAULT 'media',
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  occurrence_id UUID REFERENCES public.occurrences(id) ON DELETE CASCADE,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user_unread ON public.notifications(user_id, read_at);
CREATE INDEX idx_notif_user_created ON public.notifications(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User reads own notifications" ON public.notifications
FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "User updates own notifications" ON public.notifications
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "User deletes own notifications" ON public.notifications
FOR DELETE TO authenticated USING (user_id = auth.uid());
-- INSERT é feito por triggers/service_role; nada de policy de INSERT para authenticated.

-- ============= 6) Trigger: fanout de notificações ao inserir mensagem =============
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_title TEXT;
BEGIN
  v_title := CASE NEW.message_type
    WHEN 'solicitacao_correcao' THEN 'Solicitação de correção'
    WHEN 'alerta_prazo'         THEN 'Alerta de prazo'
    WHEN 'nao_conformidade'     THEN 'Não conformidade'
    WHEN 'rma'                  THEN 'Comunicação RMA'
    ELSE 'Nova mensagem'
  END;

  -- 1 notificação por participante (exceto o autor)
  FOR rec IN
    SELECT user_id FROM public.conversation_participants
     WHERE conversation_id = NEW.conversation_id
       AND user_id <> NEW.author_id
  LOOP
    INSERT INTO public.notifications
      (user_id, kind, title, body, priority, conversation_id, message_id)
    VALUES
      (rec.user_id,
       CASE WHEN NEW.author_id = ANY(NEW.mentions) THEN 'mencao' ELSE 'nova_mensagem' END,
       v_title,
       LEFT(NEW.content, 240),
       COALESCE(NEW.priority, 'media'),
       NEW.conversation_id,
       NEW.id);
  END LOOP;

  -- Notificações extras para menções explícitas (mesmo se não-participantes)
  IF array_length(NEW.mentions, 1) IS NOT NULL THEN
    FOR rec IN SELECT unnest(NEW.mentions) AS uid LOOP
      IF rec.uid <> NEW.author_id AND NOT EXISTS (
        SELECT 1 FROM public.conversation_participants
         WHERE conversation_id = NEW.conversation_id AND user_id = rec.uid
      ) THEN
        INSERT INTO public.notifications
          (user_id, kind, title, body, priority, conversation_id, message_id)
        VALUES (rec.uid, 'mencao', 'Você foi mencionado',
                LEFT(NEW.content, 240),
                COALESCE(NEW.priority, 'media'),
                NEW.conversation_id, NEW.id);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_notify
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

-- ============= 7) Trigger: notifica responsável ao criar/atualizar ocorrência =============
CREATE OR REPLACE FUNCTION public.notify_on_occurrence()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.responsavel_id IS NOT NULL
     AND NEW.responsavel_id <> NEW.created_by THEN
    INSERT INTO public.notifications
      (user_id, kind, title, body, priority, conversation_id, occurrence_id)
    VALUES (NEW.responsavel_id, 'ocorrencia',
            'Nova ocorrência atribuída',
            LEFT(NEW.descricao, 240),
            NEW.prioridade, NEW.conversation_id, NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.created_by <> auth.uid() THEN
      INSERT INTO public.notifications
        (user_id, kind, title, body, priority, conversation_id, occurrence_id)
      VALUES (NEW.created_by, 'mudanca_status',
              'Ocorrência: '||NEW.status,
              LEFT(NEW.descricao, 240),
              NEW.prioridade, NEW.conversation_id, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_occurrences_notify
AFTER INSERT OR UPDATE ON public.occurrences
FOR EACH ROW EXECUTE FUNCTION public.notify_on_occurrence();

-- ============= 8) Helper: marcar todas notificações de uma conversa como lidas =============
CREATE OR REPLACE FUNCTION public.mark_conversation_notifications_read(p_conversation_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.notifications
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND conversation_id = p_conversation_id
     AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ============= 9) Helper: SLA calc on insert/update conv =============
CREATE OR REPLACE FUNCTION public.compute_conversation_sla()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sla_hours IS NOT NULL AND NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := COALESCE(NEW.created_at, now()) + make_interval(hours => NEW.sla_hours);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversations_sla
BEFORE INSERT OR UPDATE OF sla_hours ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.compute_conversation_sla();

-- ============= 10) Realtime =============
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.occurrences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;
