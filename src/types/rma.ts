// Tipos compartilhados do domínio RMA. Não contém dados mockados.
// Reexporta os tipos do arquivo legado para permitir migração gradual
// dos imports `@/data/rmaMockData` → `@/types/rma`.
export type {
  RMADocument,
  RMATopic,
  RMAEntry,
  BalanceteRow,
  ReviewEntry,
} from "@/data/rmaMockData";
