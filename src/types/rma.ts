// Tipos compartilhados do domínio Prospeccao. Não contém dados mockados.
// Reexporta os tipos do arquivo legado para permitir migração gradual
// dos imports `@/data/prospeccoesMockData` → `@/types/prospeccao`.
export type {
  ProspeccaoDocument,
  ProspeccaoTopic,
  ProspeccaoEntry,
  BalanceteRow,
  ReviewEntry,
} from "@/data/prospeccoesMockData";
