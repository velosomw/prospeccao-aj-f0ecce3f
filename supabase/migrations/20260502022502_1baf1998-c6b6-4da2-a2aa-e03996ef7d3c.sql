
-- 1) Tabela de audit log de seções RMA
CREATE TABLE IF NOT EXISTS public.rma_section_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid,
  document_id uuid,
  user_id uuid,
  user_role text,
  action text NOT NULL,                -- 'allowed' | 'blocked'
  from_status text,
  to_status text,
  reason text,
  motivo text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rma_audit_section ON public.rma_section_audit_log(section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rma_audit_doc ON public.rma_section_audit_log(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rma_audit_action ON public.rma_section_audit_log(action, created_at DESC);

ALTER TABLE public.rma_section_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins leem audit log" ON public.rma_section_audit_log;
CREATE POLICY "Admins leem audit log"
  ON public.rma_section_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role)
      OR public.has_role(auth.uid(), 'coordenador'::app_role));

DROP POLICY IF EXISTS "Sistema grava audit log" ON public.rma_section_audit_log;
CREATE POLICY "Sistema grava audit log"
  ON public.rma_section_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2) Helper para identificar role principal do usuário
CREATE OR REPLACE FUNCTION public.current_primary_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'gestor_ia'::app_role)   THEN 'gestor_ia'
    WHEN public.has_role(auth.uid(), 'coordenador'::app_role) THEN 'coordenador'
    WHEN public.has_role(auth.uid(), 'consultor'::app_role)   THEN 'consultor'
    WHEN public.has_role(auth.uid(), 'magistrado'::app_role)  THEN 'magistrado'
    WHEN public.has_role(auth.uid(), 'recuperanda'::app_role) THEN 'recuperanda'
    ELSE 'autenticado'
  END;
$$;

-- 3) Reescreve transition_rma_section_status registrando audit log
CREATE OR REPLACE FUNCTION public.transition_rma_section_status(
  p_section_id uuid,
  p_new_status text,
  p_motivo text DEFAULT NULL
)
RETURNS public.rma_document_sections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.rma_document_sections%ROWTYPE;
  uid uuid := auth.uid();
  urole text := public.current_primary_role();
  is_coord  boolean := public.has_role(uid, 'coordenador'::app_role) OR public.has_role(uid, 'gestor_ia'::app_role);
  is_gestor boolean := public.has_role(uid, 'gestor_ia'::app_role);
  cur text;
  result public.rma_document_sections;
  err_msg text;
BEGIN
  SELECT * INTO s FROM public.rma_document_sections WHERE id = p_section_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.rma_section_audit_log (section_id, user_id, user_role, action, to_status, reason, error_message)
      VALUES (p_section_id, uid, urole, 'blocked', p_new_status, 'section_not_found', 'Seção não encontrada');
    RAISE EXCEPTION 'Seção % não encontrada', p_section_id;
  END IF;

  cur := s.status;

  IF cur = p_new_status THEN
    RETURN s; -- no-op, não loga
  END IF;

  -- Validação da matriz com captura de erro p/ audit
  BEGIN
    IF cur = 'pendente' AND p_new_status = 'em_edicao' THEN NULL;

    ELSIF cur = 'em_edicao' AND p_new_status = 'revisado' THEN
      IF COALESCE(s.conteudo_editado, s.conteudo_ia, '') = '' THEN
        RAISE EXCEPTION 'Conteúdo vazio: não é possível enviar para revisão';
      END IF;

    ELSIF cur = 'revisado' AND p_new_status = 'aprovado' THEN
      IF NOT is_coord THEN RAISE EXCEPTION 'Apenas Coordenador ou Gestor IA pode aprovar'; END IF;

    ELSIF cur = 'revisado' AND p_new_status = 'em_edicao' THEN
      IF NOT is_coord THEN RAISE EXCEPTION 'Apenas Coordenador ou Gestor IA pode devolver'; END IF;
      IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
        RAISE EXCEPTION 'Motivo é obrigatório para devolução (mín. 3 caracteres)';
      END IF;

    ELSIF cur = 'aprovado' AND p_new_status = 'concluido' THEN
      IF NOT is_coord THEN RAISE EXCEPTION 'Apenas Coordenador ou Gestor IA pode concluir'; END IF;

    ELSIF cur IN ('aprovado','concluido') AND p_new_status = 'em_edicao' THEN
      IF NOT is_gestor THEN RAISE EXCEPTION 'Apenas Gestor IA pode reabrir seção aprovada/concluída'; END IF;
      IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
        RAISE EXCEPTION 'Justificativa é obrigatória para reabertura (mín. 3 caracteres)';
      END IF;

    ELSIF cur = 'concluido' AND p_new_status = 'aprovado' THEN
      IF NOT is_gestor THEN RAISE EXCEPTION 'Apenas Gestor IA pode desfazer conclusão'; END IF;

    ELSE
      RAISE EXCEPTION 'Transição inválida: % → %', cur, p_new_status;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    err_msg := SQLERRM;
    INSERT INTO public.rma_section_audit_log
      (section_id, document_id, user_id, user_role, action, from_status, to_status, motivo, error_message, reason)
    VALUES
      (p_section_id, s.document_id, uid, urole, 'blocked', cur, p_new_status, p_motivo, err_msg,
       CASE
         WHEN err_msg ILIKE '%vazio%' THEN 'empty_content'
         WHEN err_msg ILIKE '%aprovar%' OR err_msg ILIKE '%devolver%' OR err_msg ILIKE '%concluir%' THEN 'role_denied'
         WHEN err_msg ILIKE '%reabrir%' OR err_msg ILIKE '%desfazer%' THEN 'role_denied'
         WHEN err_msg ILIKE '%Motivo%' OR err_msg ILIKE '%Justificativa%' THEN 'missing_reason'
         WHEN err_msg ILIKE '%Transição inválida%' THEN 'invalid_transition'
         ELSE 'other'
       END);
    RAISE EXCEPTION '%', err_msg;
  END;

  -- Aplicar update + auditoria de colunas
  UPDATE public.rma_document_sections SET
    status = p_new_status,
    enviado_revisao_por = CASE WHEN p_new_status='revisado' THEN uid ELSE enviado_revisao_por END,
    enviado_revisao_em  = CASE WHEN p_new_status='revisado' THEN now() ELSE enviado_revisao_em END,
    aprovado_por = CASE WHEN p_new_status='aprovado' AND cur='revisado' THEN uid
                        WHEN p_new_status='em_edicao' THEN NULL ELSE aprovado_por END,
    aprovado_em  = CASE WHEN p_new_status='aprovado' AND cur='revisado' THEN now()
                        WHEN p_new_status='em_edicao' THEN NULL ELSE aprovado_em END,
    concluido_por = CASE WHEN p_new_status='concluido' THEN uid
                         WHEN p_new_status IN ('em_edicao','aprovado') THEN NULL ELSE concluido_por END,
    concluido_em  = CASE WHEN p_new_status='concluido' THEN now()
                         WHEN p_new_status IN ('em_edicao','aprovado') THEN NULL ELSE concluido_em END,
    motivo_devolucao = CASE WHEN cur='revisado' AND p_new_status='em_edicao' THEN p_motivo ELSE motivo_devolucao END,
    reaberto_por  = CASE WHEN cur IN ('aprovado','concluido') AND p_new_status='em_edicao' THEN uid ELSE reaberto_por END,
    reaberto_em   = CASE WHEN cur IN ('aprovado','concluido') AND p_new_status='em_edicao' THEN now() ELSE reaberto_em END,
    reaberto_motivo = CASE WHEN cur IN ('aprovado','concluido') AND p_new_status='em_edicao' THEN p_motivo ELSE reaberto_motivo END,
    updated_at = now()
  WHERE id = p_section_id
  RETURNING * INTO result;

  -- Snapshot da transição em versions
  INSERT INTO public.rma_document_section_versions (section_id, versao, conteudo, origem, acao)
  VALUES (
    p_section_id,
    COALESCE(result.versao_atual, 1),
    COALESCE(result.conteudo_editado, result.conteudo_ia, ''),
    'transicao_status',
    cur || '->' || p_new_status || COALESCE(' | '||p_motivo, '')
  );

  -- Audit log: transição aplicada
  INSERT INTO public.rma_section_audit_log
    (section_id, document_id, user_id, user_role, action, from_status, to_status, motivo, reason)
  VALUES
    (p_section_id, s.document_id, uid, urole, 'allowed', cur, p_new_status, p_motivo, 'transition_ok');

  RETURN result;
END;
$$;
