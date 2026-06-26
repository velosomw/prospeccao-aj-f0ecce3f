
CREATE POLICY "prospeccao users read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'prospeccao-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "prospeccao users insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prospeccao-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "prospeccao users update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'prospeccao-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "prospeccao users delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'prospeccao-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
