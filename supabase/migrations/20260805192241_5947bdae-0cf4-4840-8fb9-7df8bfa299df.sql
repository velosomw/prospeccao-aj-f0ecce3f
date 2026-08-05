ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS vara text,
  ADD COLUMN IF NOT EXISTS orgao text,
  ADD COLUMN IF NOT EXISTS esfera text,
  ADD COLUMN IF NOT EXISTS registro text,
  ADD COLUMN IF NOT EXISTS especialidade text,
  ADD COLUMN IF NOT EXISTS site text,
  ADD COLUMN IF NOT EXISTS responsavel_legal text;