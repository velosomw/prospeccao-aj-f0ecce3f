// Lista canônica das 60 pastas/tópicos OneDrive — Prospecção (fonte oficial).
// Usada para associar documentos carregados em /gestao-agentes ao tópico
// correspondente, alimentando o prompt builder (contexto por pasta).

export interface RmaTopic {
  /** Número da pasta no OneDrive (1..60) */
  id: number;
  /** Slug usado como pasta lógica/path prefix no learning + prompt builder */
  slug: string;
  /** Nome de exibição (oficial) */
  label: string;
  /** Categoria macro (agrupamento visual no Select) */
  group:
    | "Estrutura"
    | "Operacional"
    | "Financeiro"
    | "Tributário"
    | "Obrigações"
    | "Garantias"
    | "Outros";
}

export const Prospecção_TOPICS: RmaTopic[] = [
  { id: 1,  slug: "01-alteracao-atividade-empresarial",         label: "Alteração na Atividade Empresarial", group: "Estrutura" },
  { id: 2,  slug: "02-alteracao-estrutura-societaria",          label: "Alteração na Estrutura Societária ou nos orgãos da Administração (Organograma)", group: "Estrutura" },
  { id: 3,  slug: "03-abertura-fechamento-estabelecimentos",    label: "Abertura ou fechamento de estabelecimentos ou alteração de endereço", group: "Estrutura" },
  { id: 4,  slug: "04-segmento-atuacao-recuperanda",            label: "Segmento de atuação ou fontes de infoprospecçãoção sobre o segmento da recuperanda", group: "Estrutura" },
  { id: 5,  slug: "05-fluxo-de-caixa",                          label: "Fluxo de Caixa", group: "Financeiro" },
  { id: 6,  slug: "06-fluxo-caixa-projetado-6m",                label: "Fluxo de Caixa Projetado 6 meses", group: "Financeiro" },
  { id: 7,  slug: "07-balancete-de-verificacao",                label: "Balancete de Verificação", group: "Financeiro" },
  { id: 8,  slug: "08-demonstrativo-do-resultado",              label: "Demonstrativo do Resultado", group: "Financeiro" },
  { id: 9,  slug: "09-controle-estoques",                       label: "Relatório de Controle de Estoques", group: "Operacional" },
  { id: 10, slug: "10-ativos-imobilizados",                     label: "Relatório de Ativos Imobilizados", group: "Operacional" },
  { id: 11, slug: "11-notas-fiscais-compras",                   label: "Relação de Notas Fiscais de Compras", group: "Operacional" },
  { id: 12, slug: "12-comprovantes-pagamento-fornecedores",     label: "Comprovantes de Pagamentos a Fornecedores", group: "Operacional" },
  { id: 13, slug: "13-extratos-bancarios",                      label: "Extratos bancários de todas as contas correntes", group: "Financeiro" },
  { id: 14, slug: "14-extrato-investimentos-aplicacoes",        label: "Extrato das contas de investimento/aplicações (se aplicável)", group: "Financeiro" },
  { id: 15, slug: "15-folha-pagamento",                         label: "Resumo da folha de pagamento", group: "Operacional" },
  { id: 16, slug: "16-rescisoes-contratuais",                   label: "Rescisões contratuais de funcionários", group: "Operacional" },
  { id: 17, slug: "17-pessoas-juridicas-contratadas",           label: "Pessoas Jurídicas contratadas (Nome, CNPJ, Atividade, valor mensal do contrato)", group: "Operacional" },
  { id: 18, slug: "18-gia-icms",                                label: "G.I.A e comprovante de pagamento do ICMS", group: "Tributário" },
  { id: 19, slug: "19-efd-contribuicoes",                       label: "EFD-Contribuições e comprovante de pagamento", group: "Tributário" },
  { id: 20, slug: "20-parcelamentos-tributarios",               label: "Demonstrativo de Adesão a Parcelamentos Tributário", group: "Tributário" },
  { id: 21, slug: "21-gfip-inss-fgts",                          label: "GFIP e comprovante de pagamento do INSS e FGTS", group: "Tributário" },
  { id: 22, slug: "22-demais-impostos-iss-funrural",            label: "Comprovante de pagamentos de demais impostos – ISS / Funrural", group: "Tributário" },
  { id: 23, slug: "23-inscricao-divida-ativa",                  label: "Inscrição na dívida ativa", group: "Tributário" },
  { id: 24, slug: "24-declaracao-dividas-vencidas-nao-pagas",   label: "Declaração assinada de dívidas vencidas e não pagas", group: "Obrigações" },
  { id: 25, slug: "25-contas-a-pagar",                          label: "Contas a Pagar — Vencidos e a Vencer (0-30 / 30-90 / 90-180 / 180+ dias)", group: "Financeiro" },
  { id: 26, slug: "26-contas-a-receber",                        label: "Contas a Receber — Vencidos e a Vencer (0-30 / 30-90 / 90-180 / 180+ dias)", group: "Financeiro" },
  { id: 27, slug: "27-obrigacao-de-dar",                        label: "Obrigação de dar", group: "Obrigações" },
  { id: 28, slug: "28-obrigacao-de-fazer",                      label: "Obrigação de fazer", group: "Obrigações" },
  { id: 29, slug: "29-obrigacao-de-entregar",                   label: "Obrigação de entregar", group: "Obrigações" },
  { id: 30, slug: "30-obrigacoes-iliquidas",                    label: "Obrigações Ilíquidas", group: "Obrigações" },
  { id: 31, slug: "31-contingencia",                            label: "Contingência", group: "Obrigações" },
  { id: 32, slug: "32-cessao-fiduciaria-titulos-creditos",      label: "Cessão fiduciária de títulos e direitos creditórios", group: "Garantias" },
  { id: 33, slug: "33-alienacao-fiduciaria",                    label: "Alienação fiduciária", group: "Garantias" },
  { id: 34, slug: "34-arrendamento-mercantil",                  label: "Arrendamento Mercantil", group: "Garantias" },
  { id: 35, slug: "35-adiantamento-contrato-cambio-acc",        label: "Adiantamento de contrato de câmbio (ACC)", group: "Garantias" },
  { id: 36, slug: "36-comprovantes-pagamento-credores-rj",      label: "Comprovantes de Pagamentos a credores pelo Plano de RJ", group: "Garantias" },
  { id: 37, slug: "37-ultima-alteracao-contratual",             label: "Última Alteração Contratual", group: "Estrutura" },
  { id: 38, slug: "38-pendencia-prospecção-anterior",                  label: "Infoprospecçãoções de pendência de Prospecção AJ anterior", group: "Outros" },
  { id: 39, slug: "39-outras-infoprospecçãocoes",                      label: "Outras Infoprospecçãoções", group: "Outros" },
  { id: 40, slug: "40-situacao-fiscal",                         label: "Situação Fiscal", group: "Tributário" },
  { id: 41, slug: "41-relacao-analitica-nfs",                   label: "Relação analítica de notas fiscais", group: "Tributário" },
  { id: 42, slug: "42-razao-fiscal-impostos",                   label: "Razão Fiscal — composição apurada dos impostos por competência", group: "Tributário" },
  { id: 43, slug: "43-leiloes",                                 label: "Leilões", group: "Operacional" },
  { id: 44, slug: "44-lista-ativos-essenciais",                 label: "Lista de Ativos Essenciais", group: "Operacional" },
  { id: 45, slug: "45-passivo-fiscal",                          label: "Impostos (Passivo Fiscal)", group: "Tributário" },
  { id: 46, slug: "46-principais-fornecedores-clientes",        label: "Lista de Principais Fornecedores e Clientes", group: "Operacional" },
  { id: 47, slug: "47-creditos-nao-sujeitos-rj",                label: "Créditos sujeitos a não recuperação judicial", group: "Garantias" },
  { id: 48, slug: "48-creditos-partes-relacionadas",            label: "Créditos com Partes Relacionadas", group: "Garantias" },
  { id: 49, slug: "49-livro-produtor-rural",                    label: "Livro do Produtor Rural", group: "Tributário" },
  { id: 50, slug: "50-imposto-de-renda",                        label: "Imposto de Renda", group: "Tributário" },
  { id: 51, slug: "51-bens-essenciais-atividade",               label: "Bens Essenciais à Atividade", group: "Operacional" },
  { id: 52, slug: "52-direitos-transmissao-mensal",             label: "Direitos de Transmissão (Mensal)", group: "Operacional" },
  { id: 53, slug: "53-patrocinios-mensal",                      label: "Patrocínio(s) (Mensal)", group: "Operacional" },
  { id: 54, slug: "54-marketing-publicidade-mensal",            label: "Marketing e Publicidade (Mensal)", group: "Operacional" },
  { id: 55, slug: "55-merchandising-mensal",                    label: "Merchandising (Mensal)", group: "Operacional" },
  { id: 56, slug: "56-franquia-mensal",                         label: "Franquia (se aplicável) (Mensal)", group: "Operacional" },
  { id: 57, slug: "57-alugueis-mensal",                         label: "Aluguéis (se aplicável) (Mensal)", group: "Operacional" },
  { id: 58, slug: "58-acordos",                                 label: "Acordos", group: "Obrigações" },
  { id: 59, slug: "59-comissoes",                               label: "Comissões", group: "Obrigações" },
  { id: 60, slug: "60-plano-orcamentario",                      label: "Plano Orçamentário", group: "Financeiro" },
];

export function getTopicBySlug(slug: string | null | undefined): RmaTopic | null {
  if (!slug) return null;
  return Prospecção_TOPICS.find((t) => t.slug === slug) || null;
}

/** Path lógico = pasta OneDrive equivalente. Alimenta o contexto do prompt builder. */
export function buildLearningPath(topicSlug: string, fileName: string): string {
  return `learning/${topicSlug}/${fileName}`;
}
