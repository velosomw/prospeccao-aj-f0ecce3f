-- Colunas de auditoria nas seções
ALTER TABLE public.rma_document_sections
  ADD COLUMN IF NOT EXISTS enviado_revisao_por uuid,
  ADD COLUMN IF NOT EXISTS enviado_revisao_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS concluido_por uuid,
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_devolucao text,
  ADD COLUMN IF NOT EXISTS reaberto_por uuid,
  ADD COLUMN IF NOT EXISTS reaberto_em timestamptz,
  ADD COLUMN IF NOT EXISTS reaberto_motivo text;

ALTER TABLE public.rma_document_section_versions
  ADD COLUMN IF NOT EXISTS acao text;

-- Função de transição validada
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
  is_coord boolean := public.has_role(uid, 'coordenador'::app_role) OR public.has_role(uid, 'gestor_ia'::app_role);
  is_gestor boolean := public.has_role(uid, 'gestor_ia'::app_role);
  cur text;
  result public.rma_document_sections;
BEGIN
  SELECT * INTO s FROM public.rma_document_sections WHERE id = p_section_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seção % não encontrada', p_section_id; END IF;

  cur := s.status;

  -- Validação da matriz
  IF cur = p_new_status THEN
    RETURN s; -- no-op
  END IF;

  -- pendente → em_edicao
  IF cur = 'pendente' AND p_new_status = 'em_edicao' THEN NULL;

  -- em_edicao → em_edicao (loop) já tratado acima
  -- em_edicao → revisado
  ELSIF cur = 'em_edicao' AND p_new_status = 'revisado' THEN
    IF COALESCE(s.conteudo_editado, s.conteudo_ia, '') = '' THEN
      RAISE EXCEPTION 'Conteúdo vazio: não é possível enviar para revisão';
    END IF;

  -- revisado → aprovado (Coordenador/Gestor)
  ELSIF cur = 'revisado' AND p_new_status = 'aprovado' THEN
    IF NOT is_coord THEN RAISE EXCEPTION 'Apenas Coordenador ou Gestor IA pode aprovar'; END IF;

  -- revisado → em_edicao (devolução com motivo)
  ELSIF cur = 'revisado' AND p_new_status = 'em_edicao' THEN
    IF NOT is_coord THEN RAISE EXCEPTION 'Apenas Coordenador ou Gestor IA pode devolver'; END IF;
    IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
      RAISE EXCEPTION 'Motivo é obrigatório para devolução';
    END IF;

  -- aprovado → concluido (Coordenador/Gestor)
  ELSIF cur = 'aprovado' AND p_new_status = 'concluido' THEN
    IF NOT is_coord THEN RAISE EXCEPTION 'Apenas Coordenador ou Gestor IA pode concluir'; END IF;

  -- Reabertura: aprovado/concluido → em_edicao (apenas Gestor)
  ELSIF cur IN ('aprovado','concluido') AND p_new_status = 'em_edicao' THEN
    IF NOT is_gestor THEN RAISE EXCEPTION 'Apenas Gestor IA pode reabrir seção aprovada/concluída'; END IF;
    IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
      RAISE EXCEPTION 'Justificativa é obrigatória para reabertura';
    END IF;

  -- concluido → aprovado (Gestor desfaz conclusão)
  ELSIF cur = 'concluido' AND p_new_status = 'aprovado' THEN
    IF NOT is_gestor THEN RAISE EXCEPTION 'Apenas Gestor IA pode desfazer conclusão'; END IF;

  ELSE
    RAISE EXCEPTION 'Transição inválida: % → %', cur, p_new_status;
  END IF;

  -- Aplicar update + auditoria
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

  RETURN result;
END;
$$;

-- Consolidação final do documento
CREATE OR REPLACE FUNCTION public.consolidate_rma_document(p_document_id uuid)
RETURNS public.rma_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int; ok int;
  result public.rma_documents;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'coordenador'::app_role)
       OR public.has_role(auth.uid(), 'gestor_ia'::app_role)) THEN
    RAISE EXCEPTION 'Apenas Coordenador ou Gestor IA pode consolidar';
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('aprovado','concluido'))
    INTO total, ok
    FROM public.rma_document_sections
   WHERE document_id = p_document_id;

  IF total = 0 THEN RAISE EXCEPTION 'Documento sem seções'; END IF;
  IF ok < total THEN
    RAISE EXCEPTION 'Consolidação bloqueada: % de % seções aprovadas', ok, total;
  END IF;

  -- Marca todas como concluído e finaliza o documento
  UPDATE public.rma_document_sections
     SET status='concluido',
         concluido_por = COALESCE(concluido_por, auth.uid()),
         concluido_em  = COALESCE(concluido_em, now()),
         updated_at = now()
   WHERE document_id = p_document_id AND status = 'aprovado';

  UPDATE public.rma_documents
     SET status='finalizado', progresso=100, updated_at=now()
   WHERE id = p_document_id
   RETURNING * INTO result;

  RETURN result;
END;
$$;