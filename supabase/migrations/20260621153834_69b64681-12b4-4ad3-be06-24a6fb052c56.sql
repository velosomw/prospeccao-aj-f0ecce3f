
DROP POLICY IF EXISTS "Admins gerenciam learning-docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins listam learning-docs" ON storage.objects;

CREATE POLICY "Equipe gerencia learning-docs"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'learning-docs' AND (
    has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenador'::app_role)
    OR has_role(auth.uid(), 'consultor'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'learning-docs' AND (
    has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenador'::app_role)
    OR has_role(auth.uid(), 'consultor'::app_role)
  )
);

CREATE POLICY "Equipe lista learning-docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'learning-docs' AND (
    has_role(auth.uid(), 'gestor_ia'::app_role)
    OR has_role(auth.uid(), 'coordenador'::app_role)
    OR has_role(auth.uid(), 'consultor'::app_role)
  )
);
