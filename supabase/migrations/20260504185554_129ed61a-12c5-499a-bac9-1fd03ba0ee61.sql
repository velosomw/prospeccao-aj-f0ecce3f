
CREATE TABLE IF NOT EXISTS public.balancete_conflict_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conflict_id UUID NOT NULL REFERENCES public.balancete_conflicts(id) ON DELETE CASCADE,
  company_id UUID,
  user_id UUID,
  user_role TEXT,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bca_conflict ON public.balancete_conflict_audit(conflict_id);
CREATE INDEX IF NOT EXISTS idx_bca_company ON public.balancete_conflict_audit(company_id);
CREATE INDEX IF NOT EXISTS idx_bca_created ON public.balancete_conflict_audit(created_at DESC);

ALTER TABLE public.balancete_conflict_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam balancete_conflict_audit"
ON public.balancete_conflict_audit FOR ALL
USING (public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role)
    OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "Consultor/owner visualiza balancete_conflict_audit"
ON public.balancete_conflict_audit FOR SELECT
USING (
  public.has_role(auth.uid(), 'consultor'::app_role)
  OR EXISTS (SELECT 1 FROM public.companies c
              WHERE c.id = balancete_conflict_audit.company_id
                AND c.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.company_consultants cc
              WHERE cc.company_id = balancete_conflict_audit.company_id
                AND cc.consultant_user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.trg_balancete_conflict_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.resolution_action IS NOT DISTINCT FROM OLD.resolution_action THEN
    RETURN NEW;
  END IF;

  v_action := COALESCE(NEW.resolution_action,
              CASE WHEN NEW.status = 'em_validacao' THEN 'manual_review'
                   WHEN NEW.status = 'resolvido' THEN 'aceitar_vencedor'
                   ELSE 'status_change' END);

  INSERT INTO public.balancete_conflict_audit
    (conflict_id, company_id, user_id, user_role, action, from_status, to_status, notes)
  VALUES (
    NEW.id, NEW.company_id, COALESCE(NEW.resolved_by, auth.uid()),
    public.current_primary_role(),
    v_action,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    NEW.resolution_notes::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS balancete_conflict_audit_trg ON public.balancete_conflicts;
CREATE TRIGGER balancete_conflict_audit_trg
AFTER UPDATE OF status, resolution_action ON public.balancete_conflicts
FOR EACH ROW EXECUTE FUNCTION public.trg_balancete_conflict_audit();
