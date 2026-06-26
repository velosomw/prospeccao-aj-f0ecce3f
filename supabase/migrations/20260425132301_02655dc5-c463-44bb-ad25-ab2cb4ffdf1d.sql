-- Restringe listagem do bucket: leitura permanece pública por path direto,
-- mas listagem (e portanto enumeração) fica restrita a admins.
DROP POLICY IF EXISTS "Public read learning-docs" ON storage.objects;

-- Admins listam/leem tudo do bucket (já coberto pela policy ALL, mas explicitamos)
CREATE POLICY "Admins listam learning-docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'learning-docs'
       AND (public.has_role(auth.uid(), 'gestor_ia')
            OR public.has_role(auth.uid(), 'coordenador')));
-- Observação: como o bucket está marcado como public=true, o endpoint
-- /storage/v1/object/public/learning-docs/<path> continua servindo o arquivo
-- por URL conhecida (preview no <iframe>/<img>) sem expor a listagem.