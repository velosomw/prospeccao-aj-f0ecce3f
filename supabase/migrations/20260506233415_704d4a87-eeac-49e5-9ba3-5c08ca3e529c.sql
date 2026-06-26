
-- Vínculo N:N entre Admjudicial (user) e Recuperanda (user)
CREATE TABLE IF NOT EXISTS public.admjudicial_recuperandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admjudicial_user_id uuid NOT NULL,
  recuperanda_user_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admjudicial_user_id, recuperanda_user_id)
);

CREATE INDEX IF NOT EXISTS idx_admjud_rec_admjud ON public.admjudicial_recuperandas(admjudicial_user_id);
CREATE INDEX IF NOT EXISTS idx_admjud_rec_rec ON public.admjudicial_recuperandas(recuperanda_user_id);

ALTER TABLE public.admjudicial_recuperandas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coord_gestor_full_admjud_rec"
  ON public.admjudicial_recuperandas FOR ALL
  USING (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor_ia'::app_role) OR public.has_role(auth.uid(), 'coordenador'::app_role));

CREATE POLICY "magistrado_select_admjud_rec"
  ON public.admjudicial_recuperandas FOR SELECT
  USING (public.has_role(auth.uid(), 'magistrado'::app_role));

CREATE POLICY "admjud_self_select"
  ON public.admjudicial_recuperandas FOR SELECT
  USING (admjudicial_user_id = auth.uid());

CREATE POLICY "rec_self_select"
  ON public.admjudicial_recuperandas FOR SELECT
  USING (recuperanda_user_id = auth.uid());

-- Helper function: verifica se um Admjudicial pode acessar dados de uma Recuperanda
CREATE OR REPLACE FUNCTION public.is_admjudicial_for_recuperanda(_recuperanda_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admjudicial_recuperandas
    WHERE admjudicial_user_id = auth.uid()
      AND recuperanda_user_id = _recuperanda_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admjudicial_for_recuperanda(uuid) TO authenticated;
