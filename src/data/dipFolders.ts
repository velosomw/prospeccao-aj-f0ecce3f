/**
 * Lista oficial das 60 pastas do OneDrive · "Documentos" do Prospecção/DIP.
 *
 * Fonte única de verdade compartilhada entre:
 *  - estrutura física do OneDrive (`/Projeto Prospecção/{CLIENTE}/{ANO}/{PERIODO}/Documentos/NN-…`);
 *  - extração de dados (agente especializado por pasta);
 *  - carga no balancete (classificação contábil predominante);
 *  - tópicos do Prospecção na platafoprospecção (`src/data/prospecçãoTopics.ts`, 1-61).
 *
 * Cada pasta tem:
 *  - `id`             : 1-60, igual ao prefixo numérico do nome da pasta no OneDrive.
 *  - `label`          : nome exibido (igual ao nome da pasta no OneDrive).
 *  - `agent`          : agente especializado responsável pela extração.
 *  - `accountClass`   : classificação contábil predominante carregada no balancete
 *                       (ATIVO, PASSIVO, PATRIMONIO_LIQUIDO, RECEITA, DESPESA, FISCAL,
 *                       CADASTRO, N_A).
 *  - `prospeccaoTopicNumber` : número do tópico correspondente em `Prospecção_TOPICS` (1-61).
 *                       O tópico 22 ("Tópicos Pendentes") é interno e não tem pasta.
 */

export type DipAccountClass =
  | "ATIVO"
  | "PASSIVO"
  | "PATRIMONIO_LIQUIDO"
  | "RECEITA"
  | "DESPESA"
  | "FISCAL"
  | "CADASTRO"
  | "N_A";

export interface DipFolder {
  id: number;
  label: string;
  agent: string;
  accountClass: DipAccountClass;
  /** Tópico correspondente em `src/data/prospecçãoTopics.ts` (Prospecção_TOPICS.number, 1-61). */
  prospeccaoTopicNumber: number;
}

export const DIP_FOLDERS: DipFolder[] = [
  { id: 1,  prospeccaoTopicNumber: 1,  label: "Alteração na Atividade Empresarial",                                              agent: "AGENTE_SOCIETARIO_ESTRUTURA",     accountClass: "CADASTRO" },
  { id: 2,  prospeccaoTopicNumber: 2,  label: "Alteração na Estrutura Societária / Organograma",                                 agent: "AGENTE_SOCIETARIO_ESTRUTURA",     accountClass: "CADASTRO" },
  { id: 3,  prospeccaoTopicNumber: 3,  label: "Abertura/fechamento de estabelecimentos ou alteração de endereço",                agent: "AGENTE_SOCIETARIO_ESTRUTURA",     accountClass: "CADASTRO" },
  { id: 4,  prospeccaoTopicNumber: 4,  label: "Segmento de atuação / fontes de infoprospecçãoção sobre o segmento",                     agent: "AGENTE_SOCIETARIO_ESTRUTURA",     accountClass: "CADASTRO" },
  { id: 5,  prospeccaoTopicNumber: 23, label: "Fluxo de Caixa",                                                                  agent: "AGENTE_FINANCEIRO_CONTABIL",      accountClass: "ATIVO" },
  { id: 6,  prospeccaoTopicNumber: 24, label: "Fluxo de Caixa Projetado 6 meses",                                                agent: "AGENTE_FINANCEIRO_CONTABIL",      accountClass: "N_A" },
  { id: 7,  prospeccaoTopicNumber: 5,  label: "Balancete de Verificação",                                                        agent: "AGENTE_FINANCEIRO_CONTABIL",      accountClass: "ATIVO" },
  { id: 8,  prospeccaoTopicNumber: 6,  label: "Demonstrativo do Resultado (DRE)",                                                agent: "AGENTE_FINANCEIRO_CONTABIL",      accountClass: "RECEITA" },
  { id: 9,  prospeccaoTopicNumber: 25, label: "Relatório de Controle de Estoques",                                               agent: "AGENTE_OPERACIONAL_ESTOQUE",      accountClass: "ATIVO" },
  { id: 10, prospeccaoTopicNumber: 7,  label: "Relatório de Ativos Imobilizados",                                                agent: "AGENTE_OPERACIONAL_ESTOQUE",      accountClass: "ATIVO" },
  { id: 11, prospeccaoTopicNumber: 26, label: "Relação de Notas Fiscais de Compras",                                             agent: "AGENTE_NFE_COMPRAS_READER",       accountClass: "DESPESA" },
  { id: 12, prospeccaoTopicNumber: 27, label: "Comprovantes de Pagamentos a Fornecedores",                                       agent: "AGENTE_COMPROVANTES_PAGAMENTOS",  accountClass: "PASSIVO" },
  { id: 13, prospeccaoTopicNumber: 8,  label: "Extratos bancários de todas as contas correntes",                                 agent: "AGENTE_EXTRATOS_BANCARIOS",       accountClass: "ATIVO" },
  { id: 14, prospeccaoTopicNumber: 9,  label: "Extrato de contas de investimento / aplicações",                                  agent: "AGENTE_EXTRATOS_BANCARIOS",       accountClass: "ATIVO" },
  { id: 15, prospeccaoTopicNumber: 28, label: "Resumo da folha de pagamento",                                                    agent: "AGENTE_RH_FOLHA",                 accountClass: "DESPESA" },
  { id: 16, prospeccaoTopicNumber: 29, label: "Rescisões contratuais de funcionários",                                           agent: "AGENTE_RH_FOLHA",                 accountClass: "DESPESA" },
  { id: 17, prospeccaoTopicNumber: 10, label: "Pessoas Jurídicas contratadas (PJs)",                                             agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "DESPESA" },
  { id: 18, prospeccaoTopicNumber: 30, label: "G.I.A e comprovante de pagamento do ICMS",                                        agent: "AGENTE_TRIBUTARIO",               accountClass: "FISCAL" },
  { id: 19, prospeccaoTopicNumber: 31, label: "EFD-Contribuições e comprovante de pagamento",                                    agent: "AGENTE_TRIBUTARIO",               accountClass: "FISCAL" },
  { id: 20, prospeccaoTopicNumber: 11, label: "Demonstrativo de Adesão a Parcelamentos Tributário",                              agent: "AGENTE_TRIBUTARIO",               accountClass: "FISCAL" },
  { id: 21, prospeccaoTopicNumber: 32, label: "GFIP e comprovante de pagamento do INSS e FGTS",                                  agent: "AGENTE_TRIBUTARIO",               accountClass: "FISCAL" },
  { id: 22, prospeccaoTopicNumber: 33, label: "Comprovantes de demais impostos — ISS / Funrural",                                agent: "AGENTE_TRIBUTARIO",               accountClass: "FISCAL" },
  { id: 23, prospeccaoTopicNumber: 12, label: "Inscrição na dívida ativa",                                                       agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 24, prospeccaoTopicNumber: 13, label: "Declaração assinada de dívidas vencidas e não pagas",                             agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 25, prospeccaoTopicNumber: 34, label: "Contas a Pagar — vencidos e a vencer (0-30/30-90/90-180/+180)",                   agent: "AGENTE_CONTAS_PAGAR_RECEBER",     accountClass: "PASSIVO" },
  { id: 26, prospeccaoTopicNumber: 35, label: "Contas a Receber — vencidos e a vencer (0-30/30-90/90-180/+180)",                 agent: "AGENTE_CONTAS_PAGAR_RECEBER",     accountClass: "ATIVO" },
  { id: 27, prospeccaoTopicNumber: 36, label: "Obrigação de dar",                                                                agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 28, prospeccaoTopicNumber: 37, label: "Obrigação de fazer",                                                              agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 29, prospeccaoTopicNumber: 38, label: "Obrigação de entregar",                                                           agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 30, prospeccaoTopicNumber: 39, label: "Obrigações Ilíquidas",                                                            agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 31, prospeccaoTopicNumber: 40, label: "Contingência",                                                                    agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 32, prospeccaoTopicNumber: 14, label: "Cessão fiduciária de títulos e direitos creditórios",                             agent: "AGENTE_GARANTIAS_CREDITO",        accountClass: "PASSIVO" },
  { id: 33, prospeccaoTopicNumber: 41, label: "Alienação fiduciária",                                                            agent: "AGENTE_GARANTIAS_CREDITO",        accountClass: "PASSIVO" },
  { id: 34, prospeccaoTopicNumber: 42, label: "Arrendamento Mercantil",                                                          agent: "AGENTE_GARANTIAS_CREDITO",        accountClass: "PASSIVO" },
  { id: 35, prospeccaoTopicNumber: 43, label: "Adiantamento de contrato de câmbio (ACC)",                                        agent: "AGENTE_GARANTIAS_CREDITO",        accountClass: "PASSIVO" },
  { id: 36, prospeccaoTopicNumber: 44, label: "Comprovantes de Pagamentos a credores pelo Plano de RJ",                          agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 37, prospeccaoTopicNumber: 15, label: "Última Alteração Contratual",                                                     agent: "AGENTE_SOCIETARIO_ESTRUTURA",     accountClass: "CADASTRO" },
  { id: 38, prospeccaoTopicNumber: 16, label: "Infoprospecçãoções de pendência de Prospecção AJ anterior",                                        agent: "AGENTE_GENERICO",                 accountClass: "N_A" },
  { id: 39, prospeccaoTopicNumber: 45, label: "Outras Infoprospecçãoções",                                                              agent: "AGENTE_GENERICO",                 accountClass: "N_A" },
  { id: 40, prospeccaoTopicNumber: 46, label: "Situação Fiscal",                                                                 agent: "AGENTE_TRIBUTARIO",               accountClass: "FISCAL" },
  { id: 41, prospeccaoTopicNumber: 17, label: "Relação analítica de notas fiscais",                                              agent: "AGENTE_FISCAL_NFE",               accountClass: "RECEITA" },
  { id: 42, prospeccaoTopicNumber: 47, label: "Razão Fiscal — composição apurada dos impostos pela competência",                 agent: "AGENTE_FISCAL_NFE",               accountClass: "FISCAL" },
  { id: 43, prospeccaoTopicNumber: 48, label: "Leilões",                                                                         agent: "AGENTE_OPERACIONAL_ESTOQUE",      accountClass: "ATIVO" },
  { id: 44, prospeccaoTopicNumber: 18, label: "Lista de Ativos Essenciais",                                                      agent: "AGENTE_OPERACIONAL_ESTOQUE",      accountClass: "ATIVO" },
  { id: 45, prospeccaoTopicNumber: 49, label: "Impostos (Passivo Fiscal)",                                                       agent: "AGENTE_TRIBUTARIO",               accountClass: "PASSIVO" },
  { id: 46, prospeccaoTopicNumber: 19, label: "Lista de Principais Fornecedores e Clientes",                                     agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "CADASTRO" },
  { id: 47, prospeccaoTopicNumber: 50, label: "Créditos sujeitos a não recuperação judicial",                                    agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 48, prospeccaoTopicNumber: 20, label: "Créditos com Partes Relacionadas",                                                agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "ATIVO" },
  { id: 49, prospeccaoTopicNumber: 51, label: "Livro do Produtor Rural",                                                         agent: "AGENTE_GENERICO",                 accountClass: "RECEITA" },
  { id: 50, prospeccaoTopicNumber: 52, label: "Imposto de Renda",                                                                agent: "AGENTE_TRIBUTARIO",               accountClass: "FISCAL" },
  { id: 51, prospeccaoTopicNumber: 21, label: "Bens Essenciais à Atividade",                                                     agent: "AGENTE_OPERACIONAL_ESTOQUE",      accountClass: "ATIVO" },
  { id: 52, prospeccaoTopicNumber: 53, label: "Direitos de Transmissão (Mensal)",                                                agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "DESPESA" },
  { id: 53, prospeccaoTopicNumber: 54, label: "Patrocínio(s) (Mensal)",                                                          agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "DESPESA" },
  { id: 54, prospeccaoTopicNumber: 55, label: "Marketing e Publicidade (Mensal)",                                                agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "DESPESA" },
  { id: 55, prospeccaoTopicNumber: 56, label: "Merchandising (Mensal)",                                                          agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "DESPESA" },
  { id: 56, prospeccaoTopicNumber: 57, label: "Franquia (Mensal)",                                                               agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "DESPESA" },
  { id: 57, prospeccaoTopicNumber: 58, label: "Aluguéis (Mensal)",                                                               agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "DESPESA" },
  { id: 58, prospeccaoTopicNumber: 59, label: "Acordos",                                                                         agent: "AGENTE_JURIDICO_OBRIGACIONAL",    accountClass: "PASSIVO" },
  { id: 59, prospeccaoTopicNumber: 60, label: "Comissões",                                                                       agent: "AGENTE_COMERCIAL_RECORRENTES",    accountClass: "DESPESA" },
  { id: 60, prospeccaoTopicNumber: 61, label: "Plano Orçamentário",                                                              agent: "AGENTE_FINANCEIRO_CONTABIL",      accountClass: "N_A" },
];

/** Tópicos Prospecção que NÃO têm pasta no OneDrive (internos da platafoprospecção). */
export const Prospecção_TOPICS_WITHOUT_DIP_FOLDER: number[] = [22]; // "Tópicos Pendentes"

/** Slug usado em path/metadata (ex.: "07-balancete-de-verificacao"). */
export function dipFolderSlug(f: DipFolder): string {
  const norm = f.label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${String(f.id).padStart(2, "0")}-${norm}`;
}

export function getDipFolderById(id: number): DipFolder | undefined {
  return DIP_FOLDERS.find((f) => f.id === id);
}

export function getDipFolderByProspeccaoTopic(prospeccaoTopicNumber: number): DipFolder | undefined {
  return DIP_FOLDERS.find((f) => f.prospeccaoTopicNumber === prospeccaoTopicNumber);
}

/**
 * Valida em runtime que a lista DIP está padronizada com Prospecção_TOPICS:
 *  - ids 1..60 únicos e sequenciais;
 *  - prospeccaoTopicNumber únicos e cobrindo todos os tópicos 1..61 exceto os listados
 *    em `Prospecção_TOPICS_WITHOUT_DIP_FOLDER`.
 * Retorna a lista de inconsistências (vazia = padronizado).
 */
export function validateDipFolderIntegrity(
  prospeccaoTopicNumbers: number[],
): string[] {
  const errors: string[] = [];
  const ids = DIP_FOLDERS.map((f) => f.id).sort((a, b) => a - b);
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== i + 1) {
      errors.push(`DIP_FOLDERS.id deve ser sequencial 1..${ids.length}, falhou em índice ${i + 1} (id=${ids[i]})`);
      break;
    }
  }
  const dipTopics = new Set(DIP_FOLDERS.map((f) => f.prospeccaoTopicNumber));
  if (dipTopics.size !== DIP_FOLDERS.length) {
    errors.push("prospeccaoTopicNumber duplicado em DIP_FOLDERS");
  }
  for (const t of prospeccaoTopicNumbers) {
    if (Prospecção_TOPICS_WITHOUT_DIP_FOLDER.includes(t)) continue;
    if (!dipTopics.has(t)) errors.push(`Prospecção topic ${t} sem pasta DIP correspondente`);
  }
  for (const t of dipTopics) {
    if (!prospeccaoTopicNumbers.includes(t)) errors.push(`DIP folder mapeia topic ${t} inexistente em Prospecção_TOPICS`);
  }
  return errors;
}

export const ACCOUNT_CLASS_LABEL: Record<DipAccountClass, string> = {
  ATIVO: "Ativo",
  PASSIVO: "Passivo",
  PATRIMONIO_LIQUIDO: "Patrimônio Líquido",
  RECEITA: "Receita",
  DESPESA: "Despesa",
  FISCAL: "Fiscal",
  CADASTRO: "Cadastro / Estrutura",
  N_A: "Não contábil",
};
