
-- 1) Tabela central de auditoria (WORM)
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL,           -- 'conversation' | 'message' | 'occurrence' | 'notification' | etc.
  entity_id     uuid,
  action        text NOT NULL,           -- 'create' | 'update' | 'delete' | 'read' | 'send' | ...
  user_id       uuid,
  user_role     text,
  conversation_id uuid,
  rma_id        text,
  company_id    uuid,
  summary       text,
  before        jsonb,
  after         jsonb,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pal_entity        ON public.platform_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_conversation  ON public.platform_audit_log (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_user          ON public.platform_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_rma           ON public.platform_audit_log (rma_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_created       ON public.platform_audit_log (created_at DESC);

GRANT SELECT, INSERT ON public.platform_audit_log TO authenticated;
GRANT ALL ON public.platform_audit_log TO service_role;

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins: tudo
CREATE POLICY pal_select_admin ON public.platform_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'gestor_ia'::app_role)
      OR public.has_role(auth.uid(),'coordenador'::app_role));

-- Próprios eventos
CREATE POLICY pal_select_self ON public.platform_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Eventos de conversas onde participo
CREATE POLICY pal_select_conv ON public.platform_audit_log
  FOR SELECT TO authenticated
  USING (conversation_id IS NOT NULL
         AND public.is_conversation_participant(conversation_id, auth.uid()));

-- Inserção controlada (trigger sobrescreve identidade)
CREATE POLICY pal_insert_auth ON public.platform_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY pal_no_update ON public.platform_audit_log
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY pal_no_delete ON public.platform_audit_log
  FOR DELETE TO authenticated USING (false);

-- 2) Trigger BEFORE INSERT garante identidade real e imutabilidade
CREATE OR REPLACE FUNCTION public.trg_pal_enforce_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id   := auth.uid();
    NEW.user_role := public.current_primary_role();
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pal_enforce_identity ON public.platform_audit_log;
CREATE TRIGGER pal_enforce_identity
  BEFORE INSERT ON public.platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.trg_pal_enforce_identity();

-- 3) Helper genérico para edge functions / RPC
CREATE OR REPLACE FUNCTION public.log_platform_event(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_summary text DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL,
  p_rma_id text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.platform_audit_log
    (entity_type, entity_id, action, summary, conversation_id, rma_id, company_id, before, after, metadata)
  VALUES
    (p_entity_type, p_entity_id, p_action, p_summary, p_conversation_id, p_rma_id, p_company_id,
     p_before, p_after, COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.log_platform_event(text,uuid,text,text,uuid,text,uuid,jsonb,jsonb,jsonb) TO authenticated, service_role;

-- 4) Triggers de auditoria automática
-- 4a) Conversations
CREATE OR REPLACE FUNCTION public.trg_audit_conversations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_audit_log
      (entity_type, entity_id, action, conversation_id, rma_id, company_id, summary, after)
    VALUES ('conversation', NEW.id, 'create', NEW.id, NEW.rma_id, NEW.company_id,
            'Conversa criada: '||COALESCE(NEW.title,'(sem título)'), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.platform_audit_log
        (entity_type, entity_id, action, conversation_id, rma_id, company_id, summary, before, after)
      VALUES ('conversation', NEW.id, 'update', NEW.id, NEW.rma_id, NEW.company_id,
              format('Conversa atualizada (status %s→%s, prio %s→%s)',
                     OLD.status, NEW.status, OLD.priority, NEW.priority),
              to_jsonb(OLD), to_jsonb(NEW));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_conversations ON public.conversations;
CREATE TRIGGER audit_conversations
  AFTER INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_conversations();

-- 4b) Messages
CREATE OR REPLACE FUNCTION public.trg_audit_messages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c_rma text; c_company uuid;
BEGIN
  SELECT rma_id, company_id INTO c_rma, c_company FROM public.conversations WHERE id = NEW.conversation_id;
  INSERT INTO public.platform_audit_log
    (entity_type, entity_id, action, conversation_id, rma_id, company_id, summary, after, metadata)
  VALUES ('message', NEW.id, 'send', NEW.conversation_id, c_rma, c_company,
          format('[%s/%s] %s', NEW.message_type, NEW.priority, LEFT(COALESCE(NEW.content,''),140)),
          to_jsonb(NEW),
          jsonb_build_object('message_type', NEW.message_type, 'priority', NEW.priority));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_messages ON public.messages;
CREATE TRIGGER audit_messages
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_messages();

-- 4c) Occurrences
CREATE OR REPLACE FUNCTION public.trg_audit_occurrences()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_audit_log
      (entity_type, entity_id, action, conversation_id, summary, after)
    VALUES ('occurrence', NEW.id, 'create', NEW.conversation_id,
            'Ocorrência aberta: '||LEFT(COALESCE(NEW.descricao,''),140), to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.platform_audit_log
      (entity_type, entity_id, action, conversation_id, summary, before, after)
    VALUES ('occurrence', NEW.id, 'status_change', NEW.conversation_id,
            format('Ocorrência %s → %s', OLD.status, NEW.status),
            to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_occurrences ON public.occurrences;
CREATE TRIGGER audit_occurrences
  AFTER INSERT OR UPDATE ON public.occurrences
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_occurrences();

-- 4d) Conversation participants (entrada/saída)
CREATE OR REPLACE FUNCTION public.trg_audit_participants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_audit_log
      (entity_type, entity_id, action, conversation_id, summary, after)
    VALUES ('participant', NEW.conversation_id, 'join', NEW.conversation_id,
            'Participante adicionado', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.platform_audit_log
      (entity_type, entity_id, action, conversation_id, summary, before)
    VALUES ('participant', OLD.conversation_id, 'leave', OLD.conversation_id,
            'Participante removido', to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS audit_participants ON public.conversation_participants;
CREATE TRIGGER audit_participants
  AFTER INSERT OR DELETE ON public.conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_participants();
