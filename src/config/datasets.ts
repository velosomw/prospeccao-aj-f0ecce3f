export type DatasetType = "AJ_NOMEADOS" | "AGCS_REALIZADAS" | "CADASTRO_AJ" | "CARTAS_AJ";

export const DATASET_CONFIGS: Record<DatasetType, {
  tableName: string;
  title: string;
  columns: { key: string; header: string; type?: string; format?: (v: any) => string }[];
}> = {
  "AJ_NOMEADOS": {
    tableName: "prospeccao_aj_nomeados",
    title: "Administradores Judiciais Nomeados e Não Nomeados",
    columns: [
      { key: "data_distribuicao", header: "Data Distribuição", type: "date" },
      { key: "mes", header: "Mês" },
      { key: "numero_processo", header: "Nº Processo" },
      { key: "empresa", header: "Empresa" },
      { key: "vara_comarca", header: "Vara e Comarca" },
      { key: "estado", header: "Estado" },
      { key: "valor_passivo", header: "Valor Passivo", type: "numeric", format: (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
      { key: "aj_nomeado", header: "AJ Nomeado" },
      { key: "juiz", header: "Juiz / Juíza" }
    ]
  },
  "AGCS_REALIZADAS": {
    tableName: "prospeccao_agcs_realizadas",
    title: "AGCs Realizadas",
    columns: [
      { key: "cliente", header: "Cliente" },
      { key: "recuperanda", header: "Recuperanda" },
      { key: "data_agc", header: "Data AGC", type: "date" },
      { key: "mes", header: "Mês" },
      { key: "ano", header: "Ano" },
      { key: "cidade", header: "Cidade" },
      { key: "estado", header: "Estado" }
    ]
  },
  "CADASTRO_AJ": {
    tableName: "prospeccao_cadastro_aj",
    title: "Cadastro de Administradores Judiciais",
    columns: [
      { key: "cliente", header: "Administrador / Escritório" },
      { key: "sigla", header: "Sigla" },
      { key: "contato", header: "Contato" },
      { key: "email", header: "E-mail" },
      { key: "telefone", header: "Telefone" },
      { key: "cidade", header: "Cidade" },
      { key: "uf", header: "UF" }
    ]
  },
  "CARTAS_AJ": {
    tableName: "prospeccao_cartas_aj",
    title: "Relação de Cartas Impressas aos AJ",
    columns: [
      { key: "data_distribuicao", header: "Data Distribuição", type: "date" },
      { key: "mes", header: "Mês" },
      { key: "cliente", header: "Cliente" },
      { key: "numero_processo", header: "Processo" },
      { key: "contato", header: "Administrador (Contato)" },
      { key: "sigla", header: "Sigla" },
      { key: "status", header: "Status" }
    ]
  }
};
