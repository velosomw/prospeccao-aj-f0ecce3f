export interface ProspeccaoDocument {
  id: string;
  name: string;
  type: 'pdf' | 'excel' | 'doc' | 'csv' | 'txt' | 'imagem';
  status: 'vazio' | 'incompleto' | 'ok';
  compliance: 'atende' | 'nao_atende' | 'parcial' | 'pendente';
}

export interface ProspeccaoTopic {
  id: string;
  pasta: number;
  name: string;
  folder: string;
  status: 'completo' | 'pendente' | 'em_processamento';
  completude: number;
  documents: ProspeccaoDocument[];
}

export interface ProspeccaoEntry {
  id: string;
  empresa: string;
  status: 'em_processamento' | 'em_revisao' | 'concluido' | 'pendente';
  percentual: number;
  dataCriacao: string;
  dataAtualizacao: string;
  responsavel: string;
  coordenador: string;
  topics: ProspeccaoTopic[];
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
const mockTopics: ProspeccaoTopic[] = [];

export const mockBalanceteData: BalanceteRow[] = [];

export const mockReviewHistory: ReviewEntry[] = [];

export const mockProspeccoes: ProspeccaoEntry[] = [];

void mockTopics;
