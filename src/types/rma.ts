// Tipos compartilhados do domínio Prospecção. Não contém dados mockados.
// Reexporta os tipos do arquivo legado para permitir migração gradual
// dos imports `@/data/prospecçãoMockData` → `@/types/prospecção`.
export type {
  ProspecçãoDocument,
  ProspecçãoTopic,
  ProspecçãoEntry,
  BalanceteRow,
  ReviewEntry,
} from "@/data/prospecçãoMockData";
