
CREATE TABLE public.control_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.control_folders TO anon, authenticated;
GRANT ALL ON public.control_folders TO service_role;
ALTER TABLE public.control_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read folders" ON public.control_folders FOR SELECT USING (true);
CREATE POLICY "public write folders" ON public.control_folders FOR INSERT WITH CHECK (true);
CREATE POLICY "public update folders" ON public.control_folders FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete folders" ON public.control_folders FOR DELETE USING (true);

CREATE TABLE public.control_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID NOT NULL REFERENCES public.control_folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  responsible TEXT NOT NULL DEFAULT 'BEX',
  priority TEXT NOT NULL DEFAULT 'media',
  start_date DATE,
  due_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.control_cards TO anon, authenticated;
GRANT ALL ON public.control_cards TO service_role;
ALTER TABLE public.control_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read cards" ON public.control_cards FOR SELECT USING (true);
CREATE POLICY "public write cards" ON public.control_cards FOR INSERT WITH CHECK (true);
CREATE POLICY "public update cards" ON public.control_cards FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete cards" ON public.control_cards FOR DELETE USING (true);
CREATE INDEX control_cards_folder_idx ON public.control_cards(folder_id);

CREATE TABLE public.control_card_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.control_cards(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT,
  from_responsible TEXT,
  to_responsible TEXT,
  actor TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.control_card_history TO anon, authenticated;
GRANT ALL ON public.control_card_history TO service_role;
ALTER TABLE public.control_card_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read history" ON public.control_card_history FOR SELECT USING (true);
CREATE POLICY "public write history" ON public.control_card_history FOR INSERT WITH CHECK (true);
CREATE INDEX control_card_history_card_idx ON public.control_card_history(card_id);

CREATE OR REPLACE FUNCTION public.control_cards_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_control_cards_updated_at
BEFORE UPDATE ON public.control_cards
FOR EACH ROW EXECUTE FUNCTION public.control_cards_set_updated_at();
