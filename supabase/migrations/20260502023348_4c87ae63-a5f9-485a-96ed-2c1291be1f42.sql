-- Corrige CHECK constraint violation: a função transition_rma_section_status
-- insere snapshots na tabela rma_document_section_versions com origem='transicao_status',
-- valor não permitido pelo CHECK existente. Trocamos por 'revisao_coordenador',
-- que pertence ao domínio permitido e descreve corretamente a ação (devolver/aprovar/concluir/reabrir).

CREATE OR REPLACE FUNCTION public.transition_rma_section_status(p_section_id uuid, p_new_status text, p_motivo text DEFAULT NULL::text)
 RETURNS rma_document_sections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    RAISE EXCEPTION 'Seção % não encontrada', p_section_id;
  END IF;

  cur := s.status;

  IF cur = p_new_status THEN
    RETURN s;
  END IF;

  -- Validação da matriz
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

  -- Aplica update
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

  -- Snapshot da transição (origem dentro do domínio permitido)
  INSERT INTO public.rma_document_section_versions (section_id, versao, conteudo, origem, acao)
  VALUES (
    p_section_id,
    COALESCE(result.versao_atual, 1),
    COALESCE(result.conteudo_editado, result.conteudo_ia, ''),
    'revisao_coordenador',
    cur || '->' || p_new_status || COALESCE(' | '||p_motivo, '')
  );

  -- Audit log: transição aplicada (commit junto, OK)
  INSERT INTO public.rma_section_audit_log
    (section_id, document_id, user_id, user_role, action, from_status, to_status, motivo, reason)
  VALUES
    (p_section_id, s.document_id, uid, urole, 'allowed', cur, p_new_status, p_motivo, 'transition_ok');

  RETURN result;
END;
$function$;