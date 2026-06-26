
CREATE TABLE public.control_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.control_users TO anon, authenticated;
GRANT ALL ON public.control_users TO service_role;
ALTER TABLE public.control_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read control users" ON public.control_users FOR SELECT USING (true);

INSERT INTO public.control_users (email, name) VALUES
  ('wanger.veloso@outlook.com', 'Wanger Veloso'),
  ('luiz@brasilexpert.com.br', 'Luiz'),
  ('coordenacaotec@brasilexpert.com.br', 'Coordenação Técnica')
ON CONFLICT (email) DO NOTHING;
