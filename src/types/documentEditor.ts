export type BlockStatus = "pending" | "accepted" | "revised" | "in_review" | "completed";
export type AssignedTo = "usuario" | "coordenador";

export interface DocumentBlock {
  id: string;
  title: string;
  content: string;
  status: BlockStatus;
  assignedTo?: AssignedTo;
  comments: DocumentComment[];
  version: number;
}

export interface DocumentComment {
  id: string;
  author: string;
  authorRole: string;
  text: string;
  timestamp: string;
}

export type DocumentSubStep = "escopo" | "relatorio";
