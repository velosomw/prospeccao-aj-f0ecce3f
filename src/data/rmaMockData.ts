export interface RMADocument {
  id: string;
  name: string;
  type: 'pdf' | 'excel' | 'doc' | 'csv' | 'txt' | 'imagem';
  status: 'vazio' | 'incompleto' | 'ok';
  compliance: 'atende' | 'nao_atende' | 'parcial' | 'pendente';
}

export interface RMATopic {
  id: string;
  pasta: number;
  name: string;
  folder: string;
  status: 'completo' | 'pendente' | 'em_processamento';
  completude: number;
  documents: RMADocument[];
}

export interface RMAEntry {
  id: string;
  empresa: string;
  status: 'em_processamento' | 'em_revisao' | 'concluido' | 'pendente';
  percentual: number;
  dataCriacao: string;
  dataAtualizacao: string;
  responsavel: string;
  coordenador: string;
  topics: RMATopic[];
}

export interface BalanceteRow {
  conta: string;
  descricao: string;
  tipo: 'grupo' | 'subgrupo' | 'conta';
  jan?: number;
  fev?: number;
  mar?: number;
  abr?: number;
  mai?: number;
  jun?: number;
  jul?: number;
}

export interface ReviewEntry {
  id: string;
  autor: string;
  papel: 'usuario' | 'coordenador';
  acao: string;
  data: string;
  hora: string;
  tempo: string;
  comentario: string;
}

// ═══ TÓPICOS baseados na Lista das Pastas OneDrive ═══
const mockTopics: RMATopic[] = [
  { id: 't1', pasta: 1, name: 'Alteração na Atividade Empresarial', folder: 'Pasta_01', status: 'completo', completude: 100,
    documents: [{ id: 'd1', name: 'Alteracao_Atividade_2024.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't2', pasta: 2, name: 'Alteração na Estrutura Societária (Organograma)', folder: 'Pasta_02', status: 'completo', completude: 100,
    documents: [
      { id: 'd2', name: 'Organograma_Atual.pdf', type: 'pdf', status: 'ok', compliance: 'atende' },
      { id: 'd2b', name: 'Ata_Alteracao_Societaria.pdf', type: 'pdf', status: 'ok', compliance: 'atende' },
    ] },
  { id: 't3', pasta: 3, name: 'Abertura/Fechamento de Estabelecimentos ou Alteração de Endereço', folder: 'Pasta_03', status: 'completo', completude: 100,
    documents: [{ id: 'd3', name: 'Comprovante_Endereco.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't4', pasta: 4, name: 'Segmento de Atuação da Recuperanda', folder: 'Pasta_04', status: 'completo', completude: 100,
    documents: [{ id: 'd4', name: 'Relatorio_Segmento.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't5', pasta: 5, name: 'Fluxo de Caixa', folder: 'Pasta_05', status: 'em_processamento', completude: 70,
    documents: [
      { id: 'd5', name: 'Fluxo_Caixa_Jan_Jul_2024.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
      { id: 'd5b', name: 'Movimentacao_Bancaria.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' },
    ] },
  { id: 't6', pasta: 6, name: 'Fluxo de Caixa Projetado 6 meses', folder: 'Pasta_06', status: 'pendente', completude: 30,
    documents: [{ id: 'd6', name: 'Projecao_Caixa_6m.xlsx', type: 'excel', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't7', pasta: 7, name: 'Balancete de Verificação', folder: 'Pasta_07', status: 'completo', completude: 100,
    documents: [
      { id: 'd7', name: 'XPT_SA_Balancete_Jan_Jul_2024.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
    ] },
  { id: 't8', pasta: 8, name: 'Demonstrativo do Resultado', folder: 'Pasta_08', status: 'completo', completude: 100,
    documents: [
      { id: 'd8', name: 'DRE_Jan_Jul_2024.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
    ] },
  { id: 't9', pasta: 9, name: 'Relatório de Controle de Estoques', folder: 'Pasta_09', status: 'em_processamento', completude: 65,
    documents: [
      { id: 'd9', name: 'Controle_Estoque_Jul2024.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
      { id: 'd9b', name: 'Inventario_Fisico.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' },
    ] },
  { id: 't10', pasta: 10, name: 'Relatório de Ativos Imobilizados', folder: 'Pasta_10', status: 'completo', completude: 100,
    documents: [{ id: 'd10', name: 'Ativos_Imobilizados_2024.xlsx', type: 'excel', status: 'ok', compliance: 'atende' }] },
  { id: 't11', pasta: 11, name: 'Relação de Notas Fiscais de Compras', folder: 'Pasta_11', status: 'em_processamento', completude: 55,
    documents: [
      { id: 'd11', name: 'NFs_Compras_Jan_Jul.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
      { id: 'd11b', name: 'XMLs_NFs.zip', type: 'txt', status: 'incompleto', compliance: 'parcial' },
    ] },
  { id: 't12', pasta: 12, name: 'Comprovantes de Pagamentos a Fornecedores', folder: 'Pasta_12', status: 'pendente', completude: 20,
    documents: [
      { id: 'd12', name: 'Pagtos_Fornecedores_Jan.pdf', type: 'pdf', status: 'ok', compliance: 'atende' },
      { id: 'd12b', name: 'Pagtos_Fornecedores_Fev_Jul.pdf', type: 'pdf', status: 'vazio', compliance: 'nao_atende' },
    ] },
  { id: 't13', pasta: 13, name: 'Extratos Bancários de Todas as Contas Correntes', folder: 'Pasta_13', status: 'completo', completude: 100,
    documents: [
      { id: 'd13', name: 'Extrato_Itau.pdf', type: 'pdf', status: 'ok', compliance: 'atende' },
      { id: 'd13b', name: 'Extrato_Bradesco.pdf', type: 'pdf', status: 'ok', compliance: 'atende' },
      { id: 'd13c', name: 'Extrato_CEF.pdf', type: 'pdf', status: 'ok', compliance: 'atende' },
    ] },
  { id: 't14', pasta: 14, name: 'Extrato Contas de Investimento/Aplicações', folder: 'Pasta_14', status: 'completo', completude: 100,
    documents: [{ id: 'd14', name: 'Aplicacoes_Bradesco.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't15', pasta: 15, name: 'Resumo da Folha de Pagamento', folder: 'Pasta_15', status: 'em_processamento', completude: 75,
    documents: [
      { id: 'd15', name: 'Folha_Resumo_Jan_Jul.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
      { id: 'd15b', name: 'Holerites_Jul.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' },
    ] },
  { id: 't16', pasta: 16, name: 'Rescisões Contratuais de Funcionários', folder: 'Pasta_16', status: 'pendente', completude: 40,
    documents: [{ id: 'd16', name: 'Rescisoes_2024.xlsx', type: 'excel', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't17', pasta: 17, name: 'Pessoas Jurídicas Contratadas', folder: 'Pasta_17', status: 'completo', completude: 100,
    documents: [{ id: 'd17', name: 'PJs_Contratadas.xlsx', type: 'excel', status: 'ok', compliance: 'atende' }] },
  { id: 't18', pasta: 18, name: 'GIA e Comprovante de Pagamento do ICMS', folder: 'Pasta_18', status: 'pendente', completude: 25,
    documents: [
      { id: 'd18', name: 'GIA_Jan_Mar.pdf', type: 'pdf', status: 'ok', compliance: 'atende' },
      { id: 'd18b', name: 'GIA_Abr_Jul.pdf', type: 'pdf', status: 'vazio', compliance: 'nao_atende' },
    ] },
  { id: 't19', pasta: 19, name: 'EFD-Contribuições e Comprovante de Pagamento', folder: 'Pasta_19', status: 'pendente', completude: 35,
    documents: [{ id: 'd19', name: 'EFD_Contrib_2024.txt', type: 'txt', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't20', pasta: 20, name: 'Demonstrativo de Adesão a Parcelamentos Tributário', folder: 'Pasta_20', status: 'completo', completude: 100,
    documents: [{ id: 'd20', name: 'Parcelamento_REFIS.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't21', pasta: 21, name: 'GFIP e Comprovante de Pagamento do INSS e FGTS', folder: 'Pasta_21', status: 'pendente', completude: 45,
    documents: [
      { id: 'd21', name: 'GFIP_Jan_Jul.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' },
      { id: 'd21b', name: 'Guias_INSS.pdf', type: 'pdf', status: 'vazio', compliance: 'nao_atende' },
    ] },
  { id: 't22', pasta: 22, name: 'Comprovante de Pagamentos de Demais Impostos (ISS, Funrural)', folder: 'Pasta_22', status: 'pendente', completude: 30,
    documents: [{ id: 'd22', name: 'ISS_Funrural_2024.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't23', pasta: 23, name: 'Inscrição na Dívida Ativa', folder: 'Pasta_23', status: 'completo', completude: 100,
    documents: [{ id: 'd23', name: 'Certidao_Divida_Ativa.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't24', pasta: 24, name: 'Declaração de Dívidas Vencidas e Não Pagas', folder: 'Pasta_24', status: 'completo', completude: 100,
    documents: [{ id: 'd24', name: 'Declaracao_Dividas.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't25', pasta: 25, name: 'Contas a Pagar (Vencidos e a Vencer)', folder: 'Pasta_25', status: 'em_processamento', completude: 60,
    documents: [
      { id: 'd25', name: 'Aging_Pagar.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
      { id: 'd25b', name: 'Detalhamento_Vencidos.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' },
    ] },
  { id: 't26', pasta: 26, name: 'Contas a Receber (Vencidos e a Vencer)', folder: 'Pasta_26', status: 'em_processamento', completude: 60,
    documents: [{ id: 'd26', name: 'Aging_Receber.xlsx', type: 'excel', status: 'ok', compliance: 'atende' }] },
  { id: 't27', pasta: 27, name: 'Obrigação de Dar', folder: 'Pasta_27', status: 'pendente', completude: 0,
    documents: [{ id: 'd27', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't28', pasta: 28, name: 'Obrigação de Fazer', folder: 'Pasta_28', status: 'pendente', completude: 0,
    documents: [{ id: 'd28', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't29', pasta: 29, name: 'Obrigação de Entregar', folder: 'Pasta_29', status: 'pendente', completude: 0,
    documents: [{ id: 'd29', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't30', pasta: 30, name: 'Obrigações Ilíquidas', folder: 'Pasta_30', status: 'pendente', completude: 0,
    documents: [{ id: 'd30', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't31', pasta: 31, name: 'Contingência', folder: 'Pasta_31', status: 'em_processamento', completude: 50,
    documents: [{ id: 'd31', name: 'Contingencias_2024.xlsx', type: 'excel', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't32', pasta: 32, name: 'Cessão Fiduciária de Títulos e Direitos Creditórios', folder: 'Pasta_32', status: 'completo', completude: 100,
    documents: [{ id: 'd32', name: 'Cessao_Fiduciaria.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't33', pasta: 33, name: 'Alienação Fiduciária', folder: 'Pasta_33', status: 'pendente', completude: 0,
    documents: [{ id: 'd33', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't34', pasta: 34, name: 'Arrendamento Mercantil', folder: 'Pasta_34', status: 'pendente', completude: 0,
    documents: [{ id: 'd34', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't35', pasta: 35, name: 'Adiantamento de Contrato de Câmbio ACC', folder: 'Pasta_35', status: 'pendente', completude: 0,
    documents: [{ id: 'd35', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't36', pasta: 36, name: 'Comprovantes de Pagamentos a Credores pelo Plano de RJ', folder: 'Pasta_36', status: 'em_processamento', completude: 55,
    documents: [
      { id: 'd36', name: 'Pagtos_Credores_Plano.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
      { id: 'd36b', name: 'Comprovantes_Bancarios.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' },
    ] },
  { id: 't37', pasta: 37, name: 'Última Alteração Contratual', folder: 'Pasta_37', status: 'completo', completude: 100,
    documents: [{ id: 'd37', name: 'Alteracao_Contratual_2024.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't38', pasta: 38, name: 'Informações de Pendência de Prospecção AJ Anterior', folder: 'Pasta_38', status: 'completo', completude: 100,
    documents: [{ id: 'd38', name: 'Pendencias_RMA_Anterior.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't39', pasta: 39, name: 'Outras Informações', folder: 'Pasta_39', status: 'pendente', completude: 10,
    documents: [{ id: 'd39', name: 'Info_Complementar.pdf', type: 'pdf', status: 'vazio', compliance: 'nao_atende' }] },
  { id: 't40', pasta: 40, name: 'Situação Fiscal', folder: 'Pasta_40', status: 'em_processamento', completude: 65,
    documents: [
      { id: 'd40', name: 'Situacao_Fiscal_RFB.pdf', type: 'pdf', status: 'ok', compliance: 'atende' },
      { id: 'd40b', name: 'Situacao_Fiscal_Estadual.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' },
    ] },
  { id: 't41', pasta: 41, name: 'Relação Analítica de Notas Fiscais', folder: 'Pasta_41', status: 'completo', completude: 100,
    documents: [{ id: 'd41', name: 'NFs_Analitico_Jan_Jul.xlsx', type: 'excel', status: 'ok', compliance: 'atende' }] },
  { id: 't42', pasta: 42, name: 'Razão Fiscal — Composição Apurada dos Impostos', folder: 'Pasta_42', status: 'pendente', completude: 40,
    documents: [{ id: 'd42', name: 'Razao_Fiscal.xlsx', type: 'excel', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't43', pasta: 43, name: 'Leilões', folder: 'Pasta_43', status: 'pendente', completude: 0,
    documents: [{ id: 'd43', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't44', pasta: 44, name: 'Lista de Ativos Essenciais', folder: 'Pasta_44', status: 'completo', completude: 100,
    documents: [{ id: 'd44', name: 'Ativos_Essenciais.xlsx', type: 'excel', status: 'ok', compliance: 'atende' }] },
  { id: 't45', pasta: 45, name: 'Impostos (Passivo Fiscal)', folder: 'Pasta_45', status: 'em_processamento', completude: 70,
    documents: [
      { id: 'd45', name: 'Passivo_Fiscal_Consolidado.xlsx', type: 'excel', status: 'ok', compliance: 'atende' },
      { id: 'd45b', name: 'Detalhamento_Tributos.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' },
    ] },
  { id: 't46', pasta: 46, name: 'Lista de Principais Fornecedores e Clientes', folder: 'Pasta_46', status: 'completo', completude: 100,
    documents: [{ id: 'd46', name: 'Top_Fornecedores_Clientes.xlsx', type: 'excel', status: 'ok', compliance: 'atende' }] },
  { id: 't47', pasta: 47, name: 'Créditos Sujeitos a Não Recuperação Judicial', folder: 'Pasta_47', status: 'pendente', completude: 35,
    documents: [{ id: 'd47', name: 'Creditos_Nao_RJ.xlsx', type: 'excel', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't48', pasta: 48, name: 'Créditos com Partes Relacionadas', folder: 'Pasta_48', status: 'completo', completude: 100,
    documents: [{ id: 'd48', name: 'Partes_Relacionadas.pdf', type: 'pdf', status: 'ok', compliance: 'atende' }] },
  { id: 't49', pasta: 49, name: 'Livro do Produtor Rural', folder: 'Pasta_49', status: 'pendente', completude: 0,
    documents: [{ id: 'd49', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't50', pasta: 50, name: 'Imposto de Renda', folder: 'Pasta_50', status: 'em_processamento', completude: 60,
    documents: [{ id: 'd50', name: 'IRPJ_CSLL_2024.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't51', pasta: 51, name: 'Bens Essenciais à Atividade', folder: 'Pasta_51', status: 'completo', completude: 100,
    documents: [{ id: 'd51', name: 'Bens_Essenciais.xlsx', type: 'excel', status: 'ok', compliance: 'atende' }] },
  { id: 't52', pasta: 52, name: 'Direitos de Transmissão (Mensal)', folder: 'Pasta_52', status: 'pendente', completude: 0,
    documents: [{ id: 'd52', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't53', pasta: 53, name: 'Patrocínio(s) (Mensal)', folder: 'Pasta_53', status: 'pendente', completude: 0,
    documents: [{ id: 'd53', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't54', pasta: 54, name: 'Marketing e Publicidade (Mensal)', folder: 'Pasta_54', status: 'pendente', completude: 0,
    documents: [{ id: 'd54', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't55', pasta: 55, name: 'Merchandising (Mensal)', folder: 'Pasta_55', status: 'pendente', completude: 0,
    documents: [{ id: 'd55', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't56', pasta: 56, name: 'Franquia (se aplicável) (Mensal)', folder: 'Pasta_56', status: 'pendente', completude: 0,
    documents: [{ id: 'd56', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't57', pasta: 57, name: 'Aluguéis (se aplicável) (Mensal)', folder: 'Pasta_57', status: 'pendente', completude: 0,
    documents: [{ id: 'd57', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't58', pasta: 58, name: 'Acordos', folder: 'Pasta_58', status: 'pendente', completude: 15,
    documents: [{ id: 'd58', name: 'Acordos_Trabalhistas.pdf', type: 'pdf', status: 'incompleto', compliance: 'parcial' }] },
  { id: 't59', pasta: 59, name: 'Comissões', folder: 'Pasta_59', status: 'pendente', completude: 0,
    documents: [{ id: 'd59', name: '', type: 'pdf', status: 'vazio', compliance: 'pendente' }] },
  { id: 't60', pasta: 60, name: 'Plano Orçamentário', folder: 'Pasta_60', status: 'pendente', completude: 20,
    documents: [{ id: 'd60', name: 'Orcamento_2024_Draft.xlsx', type: 'excel', status: 'incompleto', compliance: 'parcial' }] },
];

// ═══ BALANCETE real (dados extraídos do XPT S.A.) ═══
export const mockBalanceteData: BalanceteRow[] = [
  // ATIVO
  { conta: '1', descricao: 'ATIVO', tipo: 'grupo', jan: 38571095.82, fev: 40355203.71, mar: 38330739.28, abr: 38637865.99, mai: 32151186.79, jun: 46421735.64, jul: 52474193.29 },
  { conta: '11', descricao: 'Ativo Circulante', tipo: 'subgrupo', jan: 33279217.81, fev: 35063569.84, mar: 33039305.13, abr: 33346696.84, mai: 26860217.32, jun: 41130977.05, jul: 47183645.58 },
  { conta: '111', descricao: 'Bens e Numerários', tipo: 'conta', jan: 104675.35, fev: 161275.93, mar: 230988.90, abr: 269916.00, mai: 326042.03, jun: 376160.15, jul: 417942.96 },
  { conta: '112', descricao: 'Clientes', tipo: 'conta', jan: 17942290.55, fev: 18223799.17, mar: 18403907.16, abr: 18706608.15, mai: 3229710.26, jun: 13993141.01, jul: 9291254.31 },
  { conta: '113', descricao: 'Estoque', tipo: 'conta', jan: 8419703.68, fev: 8420648.79, mar: 8282773.70, abr: 8359424.27, mai: 17361135.86, jun: 21254019.33, jul: 31393090.08 },
  { conta: '114', descricao: 'Outros Valores a Receber', tipo: 'conta', jan: 1878267.88, fev: 3200131.14, mar: 1190174.60, abr: 1183225.16, mai: 1226406.10, jun: 387733.49, jul: 4954435.16 },
  { conta: '115', descricao: 'Valores a Recuperar', tipo: 'conta', jan: 4934280.35, fev: 5057714.81, mar: 4931460.77, abr: 4827523.26, mai: 4716923.07, jun: 5119923.07, jul: 1126923.07 },
  { conta: '12', descricao: 'Ativo Não Circulante', tipo: 'subgrupo', jan: 2748294.32, fev: 2748050.18, mar: 2747850.46, abr: 2747585.46, mai: 2747385.78, jul: 2742139.94 },
  { conta: '13', descricao: 'Ativo Permanente', tipo: 'subgrupo', jan: 2543583.69, fev: 2543583.69, mar: 2543583.69, abr: 2543583.69, mai: 2543583.69, jun: 2548407.77, jul: 2548407.77 },

  // PASSIVO
  { conta: '2', descricao: 'PASSIVO', tipo: 'grupo', jan: -267319556.33, fev: -265820103.62, mar: -261277252.95, abr: -260129236.93, mai: -237606117.27, jun: -182523612.48, jul: -103709380.21 },
  { conta: '21', descricao: 'Passivo Circulante', tipo: 'subgrupo', jan: -134064432.86, fev: -134270568.67, mar: -131994698.33, abr: -133162985.25, mai: -113073733.73, jun: -81565509.74, jul: -48192673.56 },
  { conta: '211', descricao: 'Fornecedores', tipo: 'conta', jan: -7041083.58, fev: -7200497.71, mar: -8102193.73, abr: -8474752.06, mai: -7893498.84, jun: -8141804.14, jul: -8179783.16 },
  { conta: '212', descricao: 'Contas a Pagar', tipo: 'conta', jan: -2769190.56, fev: -3186764.86, mar: -3327218.13, abr: -3715826.92, mai: -3992419.12, jun: -5765805.26, jul: -6900923.04 },
  { conta: '213', descricao: 'Salários e Encargos Sociais', tipo: 'conta', jan: -28682022.33, fev: -27951693.26, mar: -25894403.86, abr: -25914483.32, mai: -22395427.10, jun: -17474591.04, jul: -14552094.02 },
  { conta: '214', descricao: 'Tributos e Contribuições a Recolher', tipo: 'conta', jan: -94056164.18, fev: -94401093.43, mar: -93094432.88, abr: -93489802.76, mai: -77238982.99, jun: -48645331.73, jul: -11115280.54 },
  { conta: '215', descricao: 'Instituições Financeiras', tipo: 'conta', jan: -1480217.25, fev: -1494764.45, mar: -1540694.77, abr: -1532365.23, mai: -1517650.72, jun: -1502222.61, jul: -7408837.84 },
  { conta: '217', descricao: 'Outras Contas a Pagar', tipo: 'conta', jan: -35754.96, fev: -35754.96, mar: -35754.96, abr: -35754.96, mai: -35754.96, jun: -35754.96, jul: -35754.96 },
  { conta: '22', descricao: 'Não Circulante — Longo Prazo', tipo: 'subgrupo', jan: -372960268.28, fev: -371254679.76, mar: -368987699.43, abr: -366671396.49, mai: -364237528.35, jun: -340663247.55, jul: -295221851.46 },
  { conta: '23', descricao: 'Patrimônio Líquido', tipo: 'subgrupo', jan: 239705144.81, fev: 239705144.81, mar: 239705144.81, abr: 239705144.81, mai: 239705144.81, jun: 239705144.81, jul: 239705144.81 },

  // DRE
  { conta: '3', descricao: 'Receitas sobre Vendas', tipo: 'grupo', jan: -5865006.54, fev: -11530637.42, mar: -15750281.27, abr: -21159413.04, mai: -26310296.63, jun: -33175965.14, jul: -40541858.80 },
  { conta: '31', descricao: 'Receita Bruta de Vendas', tipo: 'conta', jan: -7190704.28, fev: -14185755.70, mar: -19348025.03, abr: -25982759.87, mai: -32474001.75, jun: -41014754.02, jul: -49247787.49 },
  { conta: '32', descricao: '(-) Devoluções e Abatimentos', tipo: 'conta', jan: 94235.51, fev: 186312.98, mar: 274155.20, abr: 310741.36, mai: 319621.22, jun: 352100.00, jul: 388679.87 },
  { conta: '33', descricao: '(-) Impostos sobre Vendas', tipo: 'conta', jan: 1231462.23, fev: 2468805.30, mar: 3323588.56, abr: 4512605.47, mai: 5844083.90, jun: 7486688.88, jul: 8317248.82 },
  { conta: '4', descricao: 'Custos das Vendas e Serviços', tipo: 'grupo', jan: 3472380.88, fev: 7055963.02, mar: 10210419.45, abr: 14028605.95, mai: 17662429.73, jun: 22286730.39, jul: 27651474.22 },
  { conta: '5', descricao: 'Custo Industrial', tipo: 'grupo', jan: 50596.35, fev: 114478.53, mar: 184555.51, abr: 267025.14, mai: 373274.33, jun: 561710.39, jul: 843594.12 },
  { conta: '6', descricao: 'Despesas Operacionais', tipo: 'grupo', jan: 1928518.82, fev: 3878159.12, mar: 5867783.67, abr: 7839283.26, mai: 9770093.39, jun: 11940800.83, jul: 14482649.06 },
  { conta: '61', descricao: 'Despesas Comerciais', tipo: 'conta', jan: 1281511.01, fev: 2574982.88, mar: 3868600.76, abr: 5168523.10, mai: 6455982.66, jun: 7949744.81, jul: 9508143.38 },
  { conta: '62', descricao: 'Despesas Administrativas', tipo: 'conta', jan: 597264.81, fev: 1203433.24, mar: 1849439.91, abr: 2471016.66, mai: 3113367.73, jun: 3754648.83, jul: 4538098.49 },
  { conta: '63', descricao: 'Outras Despesas Operacionais', tipo: 'conta', jan: 49743.00, fev: 99743.00, mar: 149743.00, abr: 199743.50, mai: 200743.00, jun: 236407.19, jul: 436407.19 },
  { conta: '7', descricao: 'Despesas e Receitas Financeiras', tipo: 'grupo', jan: 229158785.96, fev: 226057277.04, mar: 222745128.75, abr: 219562098.14, mai: 221955727.28, jun: 135438576.27, jul: 48778328.98 },
  { conta: '8', descricao: 'Despesas e Receitas não Operacionais', tipo: 'grupo', jan: 3185.04, fev: 7310.11, mar: 10385.34, abr: 15262.26, mai: 17621.98, jun: 19447.18, jul: 20999.34 },
];

export const mockReviewHistory: ReviewEntry[] = [
  { id: 'r1', autor: 'Ana Silva', papel: 'usuario', acao: 'Enviou para revisão', data: '2024-07-15', hora: '14:30', tempo: '4h 15min', comentario: 'Documentação das pastas 1-20 completa. Pendente validação das pastas fiscais (18, 19, 21, 22).' },
  { id: 'r2', autor: 'Maria Coordenadora', papel: 'coordenador', acao: 'Revisão iniciada', data: '2024-07-16', hora: '09:00', tempo: '0min', comentario: 'Iniciando análise da documentação do RMA XPT S.A.' },
  { id: 'r3', autor: 'Maria Coordenadora', papel: 'coordenador', acao: 'Comentário adicionado', data: '2024-07-16', hora: '11:45', tempo: '2h 45min', comentario: 'Divergência encontrada no FGTS (pasta 21). GIA incompleta a partir de abril (pasta 18). Solicitar reenvio.' },
  { id: 'r4', autor: 'Maria Coordenadora', papel: 'coordenador', acao: 'Devolvido para ajustes', data: '2024-07-16', hora: '14:00', tempo: '5h', comentario: 'Necessário completar pastas 27-30 (obrigações) e pastas 33-35 (garantias). Total de 12 pastas vazias.' },
  { id: 'r5', autor: 'Ana Silva', papel: 'usuario', acao: 'Ajustes realizados', data: '2024-07-17', hora: '10:30', tempo: '3h 30min', comentario: 'Correções aplicadas nas pastas fiscais. Pastas de obrigações confirmadas como N/A pela recuperanda.' },
];

export const mockRMAs: RMAEntry[] = [
  {
    id: 'RMA-001',
    empresa: 'XPT Indústria S.A.',
    status: 'em_processamento',
    percentual: Math.round(mockTopics.reduce((s, t) => s + t.completude, 0) / mockTopics.length),
    dataCriacao: '2024-01-10',
    dataAtualizacao: '2024-07-17',
    responsavel: 'Ana Silva',
    coordenador: 'Maria Coordenadora',
    topics: mockTopics,
  },
  {
    id: 'RMA-002',
    empresa: 'ABC Comércio Ltda.',
    status: 'em_revisao',
    percentual: 85,
    dataCriacao: '2024-01-05',
    dataAtualizacao: '2024-07-16',
    responsavel: 'Carlos Souza',
    coordenador: 'Maria Coordenadora',
    topics: mockTopics.map(t => ({ ...t, completude: Math.min(100, t.completude + 25) })),
  },
  {
    id: 'RMA-003',
    empresa: 'DEF Serviços S.A.',
    status: 'concluido',
    percentual: 100,
    dataCriacao: '2023-12-01',
    dataAtualizacao: '2024-06-30',
    responsavel: 'Pedro Lima',
    coordenador: 'Maria Coordenadora',
    topics: mockTopics.map(t => ({ ...t, status: 'completo' as const, completude: 100 })),
  },
  {
    id: 'RMA-004',
    empresa: 'GHI Transportes Ltda.',
    status: 'pendente',
    percentual: 8,
    dataCriacao: '2024-07-18',
    dataAtualizacao: '2024-07-18',
    responsavel: 'Ana Silva',
    coordenador: 'Maria Coordenadora',
    topics: mockTopics.map(t => ({ ...t, status: 'pendente' as const, completude: Math.max(0, t.completude - 50) })),
  },
];
