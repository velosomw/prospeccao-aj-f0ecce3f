import { useState } from "react";
import {
  FileText, Check, RotateCcw, MessageSquare, Send, Edit3,
  UserCheck, CheckCircle2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DocumentBlock, BlockStatus } from "@/types/documentEditor";

interface Props {
  title: string;
  blocks: DocumentBlock[];
  onUpdateBlock: (id: string, updates: Partial<DocumentBlock>) => void;
  onAddComment: (blockId: string, text: string) => void;
  onAdvance: () => void;
}

const statusConfig: Record<BlockStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: "Pendente", color: "hsl(38,92%,50%)", icon: Edit3 },
  accepted: { label: "Aceito", color: "hsl(142,76%,36%)", icon: Check },
  revised: { label: "Revisado", color: "hsl(217,91%,50%)", icon: RotateCcw },
  in_review: { label: "Em Revisão", color: "hsl(258,90%,56%)", icon: UserCheck },
  completed: { label: "Concluído", color: "hsl(142,76%,30%)", icon: CheckCircle2 },
};

const EditorInteligenteView = ({ title, blocks, onUpdateBlock, onAddComment, onAdvance }: Props) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [commentingBlockId, setCommentingBlockId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

  const acceptedCount = blocks.filter(b => b.status === "accepted" || b.status === "completed").length;

  // Collect all comments across blocks for the right panel
  const allComments = blocks.flatMap(b =>
    b.comments.map(c => ({ ...c, blockTitle: b.title, blockId: b.id }))
  ).sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const handleEdit = (block: DocumentBlock) => {
    setEditingId(block.id);
    setEditText(block.content);
  };

  const handleSaveEdit = (id: string) => {
    onUpdateBlock(id, { content: editText, status: "revised", version: (blocks.find(b => b.id === id)?.version || 0) + 1 });
    setEditingId(null);
  };

  const handleSubmitComment = () => {
    if (!commentText.trim() || !commentingBlockId) return;
    onAddComment(commentingBlockId, commentText.trim());
    setCommentText("");
    setCommentingBlockId(null);
  };

  const openCommentPanel = (blockId: string) => {
    setCommentingBlockId(prev => prev === blockId ? null : blockId);
    setCommentText("");
  };

  const activeBlock = commentingBlockId ? blocks.find(b => b.id === commentingBlockId) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
      {/* Left: Document blocks */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-[hsl(258,90%,56%)]" />
              Documento A4 — Editor Inteligente
            </CardTitle>
            <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-0 text-xs">
              {acceptedCount}/{blocks.length} aceitos
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-380px)]">
            <div className="space-y-4 pr-4">
              {blocks.map((block, i) => {
                const sc = statusConfig[block.status];
                const StatusIcon = sc.icon;
                const isEditing = editingId === block.id;
                const isCommenting = commentingBlockId === block.id;

                return (
                  <div
                    key={block.id}
                    className={`border rounded-lg overflow-hidden transition-all ${isCommenting ? 'ring-2 ring-[hsl(217,91%,50%)]/30' : ''}`}
                    style={{ borderColor: `color-mix(in srgb, ${sc.color} 40%, transparent)` }}
                  >
                    <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
                      <h3 className="font-semibold text-sm">{i + 1}. {block.title}</h3>
                      <Badge
                        className="text-[10px] border-0 gap-1"
                        style={{ backgroundColor: `color-mix(in srgb, ${sc.color} 15%, white)`, color: sc.color }}
                      >
                        <StatusIcon className="w-3 h-3" /> {sc.label}
                      </Badge>
                    </div>

                    <div className="p-4">
                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            className="min-h-[120px] text-sm"
                          />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="text-xs">Cancelar</Button>
                            <Button size="sm" onClick={() => handleSaveEdit(block.id)} className="text-xs bg-[hsl(217,91%,50%)] text-white">Salvar</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{block.content}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/10">
                      <div className="flex gap-1">
                        {block.status !== "completed" && (
                          <>
                            <Button size="sm" variant="ghost" className="text-[10px] h-7 gap-1 text-[hsl(142,76%,36%)]" onClick={() => onUpdateBlock(block.id, { status: "accepted" })}>
                              <Check className="w-3 h-3" /> Aceitar
                            </Button>
                            <Button size="sm" variant="ghost" className="text-[10px] h-7 gap-1" onClick={() => handleEdit(block)}>
                              <Edit3 className="w-3 h-3" /> Editar
                            </Button>
                            <Button size="sm" variant="ghost" className="text-[10px] h-7 gap-1 text-[hsl(38,92%,50%)]" onClick={() => onUpdateBlock(block.id, { status: "pending" })}>
                              <RotateCcw className="w-3 h-3" /> Refazer
                            </Button>
                            <Button size="sm" variant="ghost" className="text-[10px] h-7 gap-1 text-[hsl(258,90%,56%)]" onClick={() => onUpdateBlock(block.id, { status: "in_review", assignedTo: "coordenador" })}>
                              <UserCheck className="w-3 h-3" /> Coordenador
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="text-[10px] h-7 gap-1 text-[hsl(142,76%,30%)]" onClick={() => onUpdateBlock(block.id, { status: "completed" })}>
                          <CheckCircle2 className="w-3 h-3" /> Concluir
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant={isCommenting ? "default" : "ghost"}
                        className={`text-[10px] h-7 gap-1 ${isCommenting ? 'bg-[hsl(217,91%,50%)] text-white' : ''}`}
                        onClick={() => openCommentPanel(block.id)}
                      >
                        <MessageSquare className="w-3 h-3" />
                        {block.comments.length > 0 ? `${block.comments.length}` : "Comentar"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex justify-end mt-4">
            <Button
              onClick={onAdvance}
              className="bg-gradient-to-r from-[hsl(258,90%,56%)] to-[hsl(217,91%,50%)] text-white rounded-full px-6"
            >
              Aceitar Escopo →
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Right: Comments & refinement panel */}
      <Card className="hidden lg:block">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Comentários & Refinamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-380px)]">
            {/* Comment input for active block */}
            {activeBlock && (
              <div className="mb-4 p-3 rounded-lg border border-[hsl(217,91%,50%)]/30 bg-[hsl(217,91%,50%)]/5">
                <p className="text-xs font-semibold mb-2 text-[hsl(217,91%,50%)]">
                  Comentar: {activeBlock.title}
                </p>
                <Textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Adicionar comentário..."
                  className="min-h-[80px] text-xs mb-2"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setCommentingBlockId(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="text-xs bg-[hsl(217,91%,50%)] text-white gap-1" onClick={handleSubmitComment}>
                    <Send className="w-3 h-3" /> Enviar
                  </Button>
                </div>
              </div>
            )}

            {/* All comments list */}
            {allComments.length > 0 ? (
              <div className="space-y-3">
                {allComments.map(c => (
                  <div key={c.id} className="text-xs p-3 rounded-lg bg-muted/30 border">
                    <div className="flex items-center gap-1 mb-1">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{c.blockTitle}</Badge>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="font-medium">{c.author} <span className="text-muted-foreground">({c.authorRole})</span></span>
                      <span className="text-muted-foreground">{c.timestamp}</span>
                    </div>
                    <p className="text-muted-foreground">{c.text}</p>
                  </div>
                ))}
              </div>
            ) : !activeBlock ? (
              <div className="text-xs text-muted-foreground text-center py-12">
                Clique em "Comentar" em um bloco para adicionar comentários.
              </div>
            ) : null}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default EditorInteligenteView;
