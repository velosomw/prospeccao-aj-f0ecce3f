-- Liberação do Relatório RMA Final para a Recuperanda (gating Coordenador → Recuperanda)
ALTER TABLE public.rma_documents
  ADD COLUMN IF NOT EXISTS released_to_recuperanda_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_to_recuperanda_by uuid,
  ADD COLUMN IF NOT EXISTS released_to_recuperanda_notes text;

CREATE OR REPLACE FUNCTION public.set_rma_document_recuperanda_release(
  p_document_id uuid,
  p_release boolean,
  p_notes text DEFAULT NULL
)
RETURNS public.rma_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result public.rma_documents;
BEGIN
  IF NOT (public.has_role(uid, 'coordenador'::app_role)
          OR public.has_role(uid, 'gestor_ia'::app_role)) THEN
    RAISE EXCEPTION 'Apenas Coordenador ou Gestor IA pode liberar/revogar o Relatório Final para a Recuperanda';
  END IF;

  UPDATE public.rma_documents
     SET released_to_recuperanda_at = CASE WHEN p_release THEN now() ELSE NULL END,
         released_to_recuperanda_by = CASE WHEN p_release THEN uid ELSE NULL END,
         released_to_recuperanda_notes = CASE WHEN p_release THEN p_notes ELSE NULL END,
         updated_at = now()
   WHERE id = p_document_id
   RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento % não encontrado', p_document_id;
  END IF;
  RETURN result;
END;
$$;