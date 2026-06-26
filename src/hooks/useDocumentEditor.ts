import { useState, useCallback } from "react";
import type { DocumentBlock, DocumentComment, DocumentSubStep } from "@/types/documentEditor";

export const useDocumentEditor = (initialBlocks: DocumentBlock[]) => {
  const [subStep, setSubStep] = useState<DocumentSubStep>("escopo");
  const [blocks, setBlocks] = useState<DocumentBlock[]>(initialBlocks);

  const updateBlock = useCallback((id: string, updates: Partial<DocumentBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const addComment = useCallback((blockId: string, text: string) => {
    const comment: DocumentComment = {
      id: crypto.randomUUID(),
      author: "Usuário",
      authorRole: "Consultor",
      text,
      timestamp: new Date().toLocaleString("pt-BR"),
    };
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, comments: [...b.comments, comment] } : b
    ));
  }, []);

  const allCompleted = blocks.every(b => b.status === "completed");

  return { subStep, setSubStep, blocks, updateBlock, addComment, allCompleted };
};
