
-- Cobrancas table
CREATE TABLE public.rma_cobrancas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rma_id TEXT NOT NULL,
  company_name TEXT,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  file_path TEXT,
  has_attachment BOOLEAN NOT NULL DEFAULT false,
  sent_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rma_cobrancas_rma ON public.rma_cobrancas(rma_id, sent_at DESC);

ALTER TABLE public.rma_cobrancas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cobrancas"
ON public.rma_cobrancas FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated can insert cobrancas"
ON public.rma_cobrancas FOR INSERT
TO authenticated WITH CHECK (auth.uid() = sent_by);

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cobranca-attachments', 'cobranca-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can read cobranca attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'cobranca-attachments');

CREATE POLICY "Authenticated can upload cobranca attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'cobranca-attachments');
