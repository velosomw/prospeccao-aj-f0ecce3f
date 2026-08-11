import { useState, useRef, useCallback } from "react";
import {
  FileText, Check, MessageSquare, Send,
  CheckCircle2, Clock, User, AlertCircle, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DocumentBlock } from "@/types/documentEditor";
import logoBex from "@/assets/logo-bex-full.jpeg";

interface Props {
  documentTitle: string;
  documentSubtitle: string;
  blocks: DocumentBlock[];
  onUpdateBlock: (id: string, updates: Partial<DocumentBlock>) => void;
  onAddComment: (blockId: string, text: string) => void;
  onFinalize: () => void;
  finalLabel: string;
  finalDisabled?: boolean;
  finalHint?: string;
  readOnly?: boolean;
}

const BEX_LOGO_TEXT = "BRASIL EXPERT";
const BEX_TAGLINE = "Transparência na Reestruturação e Recuperação de Empresas";

const statusLabel: Record<string, { label: string; color: string }> = {
  completed: { label: "Concluído", color: "hsl(142,76%,36%)" },
  accepted: { label: "Aceito", color: "hsl(142,76%,36%)" },
  revised: { label: "Revisado", color: "hsl(217,91%,50%)" },
  in_review: { label: "Em Revisão", color: "hsl(38,92%,50%)" },
  pending: { label: "Pendente", color: "hsl(0,0%,60%)" },
};

const RelatorioA4View = ({ documentTitle, documentSubtitle, blocks, onUpdateBlock, onAddComment, onFinalize, finalLabel, finalDisabled = false, finalHint, readOnly = false }: Props) => {
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [activeBlockId, setActiveBlockId] = useState<string | null>(blocks[0]?.id ?? null);
  const printRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const completedCount = blocks.filter(b => b.status === "completed").length;
  const allCompleted = completedCount === blocks.length;

  const scrollToBlock = useCallback((blockId: string) => {
    const el = blockRefs.current[blockId];
    if (!el) return;
    setActiveBlockId(blockId);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // bullet color: green = completed/accepted, red = in_review/revised (em revisão), gray = pending
  const bulletClass = (status: DocumentBlock["status"]) => {
    if (status === "completed" || status === "accepted") return "bg-[hsl(142,76%,36%)]";
    if (status === "in_review" || status === "revised") return "bg-[hsl(0,84%,60%)]";
    return "bg-muted-foreground/30";
  };

  const handleSubmitComment = (blockId: string) => {
    if (!commentText.trim()) return;
    onAddComment(blockId, commentText.trim());
    setCommentText("");
    setCommentingId(null);
  };

  const A4Page = ({ children, showHeader = true, isCover = false }: { children: React.ReactNode; showHeader?: boolean; isCover?: boolean }) => (
    <div className="max-w-[780px] mx-auto bg-white shadow-md rounded border mb-10 relative" style={{ minHeight: "1100px", padding: "40px 48px" }}>
      {!isCover && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[80px] font-extrabold text-foreground/[0.03]">BEX</span>
        </div>
      )}
      {showHeader && !isCover && (
        <div className="flex items-center justify-end pb-2 mb-4 border-b-2 border-[hsl(210,60%,30%)]">
          <div className="text-right">
            <span className="text-[10px] font-bold tracking-widest text-[hsl(210,60%,30%)]">{BEX_LOGO_TEXT}</span>
            <p className="text-[7px] text-muted-foreground">{BEX_TAGLINE}</p>
          </div>
        </div>
      )}
      {children}
      <div className="absolute bottom-4 left-0 right-0 text-center text-[8px] text-muted-foreground border-t pt-2 mx-12 leading-relaxed">
        <p>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo-SP, CEP: 04003-003</p>
        <p>(11) 3285-4472 · https://www.brasilexpert.com.br/</p>
      </div>
    </div>
  );

  const issueDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const completionPct = blocks.length > 0 ? Math.round((completedCount / blocks.length) * 100) : 0;
  const statusZone = completionPct >= 90
    ? { label: "Documento Concluído", color: "hsl(142,76%,36%)", bg: "hsl(142,76%,36%)" }
    : completionPct >= 50
    ? { label: "Em Revisão Técnica", color: "hsl(38,92%,50%)", bg: "hsl(38,92%,50%)" }
    : { label: "Em Elaboração", color: "hsl(0,84%,60%)", bg: "hsl(0,84%,60%)" };

  // Check if a block has any annotations (status != pending or has comments)
  const hasAnnotations = (block: DocumentBlock) =>
    block.status !== "pending" || block.comments.length > 0;

  // Blocks that have any annotation
  const annotatedBlocks = blocks.filter(hasAnnotations);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-[hsl(217,91%,50%)]" /> {documentTitle}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs border-0 ${allCompleted ? "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)]" : "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)]"}`}>
              {completedCount}/{blocks.length} concluídos
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Total de páginas: {blocks.length + 2}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          {/* Left: Navigation Sidebar */}
          <div className="w-[260px] shrink-0">
            <div className="sticky top-0 bg-card border rounded-lg">
              <div className="p-3 border-b">
                <h3 className="text-xs font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
                  Navegação do Documento
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Clique em um capítulo para visualizar
                </p>
                <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[hsl(142,76%,36%)]" /> Concluído</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[hsl(0,84%,60%)]" /> Em revisão</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" /> Pendente</span>
                </div>
              </div>
              <ScrollArea className="h-[calc(100vh-460px)]">
                <div className="p-2 space-y-0.5">
                  {blocks.map((block, i) => {
                    const isActive = activeBlockId === block.id;
                    return (
                      <button
                        key={block.id}
                        onClick={() => scrollToBlock(block.id)}
                        className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md text-[11px] transition-colors border ${
                          isActive
                            ? "border-[hsl(217,91%,50%)]/40 bg-[hsl(217,91%,50%)]/5"
                            : "border-transparent hover:bg-muted/50"
                        }`}
                      >
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${bulletClass(block.status)}`} />
                        <span className="flex-1 leading-snug">
                          <span className="text-muted-foreground">{i + 1}.</span>{" "}
                          <span className="font-medium">{block.title}</span>
                        </span>
                        {isActive && <ChevronRight className="w-3 h-3 mt-1 text-[hsl(217,91%,50%)] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Center: A4 Document */}
          <div className="flex-1 bg-[hsl(220,10%,92%)] rounded-lg p-6" style={{ paddingTop: "40px", paddingBottom: "40px" }}>
            <ScrollArea className="h-[calc(100vh-400px)]" ref={scrollAreaRef as any}>
              <div ref={printRef}>
                {/* === PAGE 1: COVER (padrão BEx — espelho do PDF Kanitz) === */}
                <A4Page showHeader={false} isCover>
                  <div className="flex flex-col" style={{ minHeight: "1000px" }}>
                    {/* Logo no topo direito */}
                    <div className="flex justify-end">
                      <img
                        src={logoBex}
                        alt="Brasil Expert — BEx"
                        className="h-16 w-auto object-contain"
                      />
                    </div>

                    {/* "BRASIL EXPERT" centralizado abaixo do logo */}
                    <div className="text-center mt-10">
                      <h1 className="text-[22px] font-bold tracking-[0.18em] text-foreground">
                        BRASIL EXPERT
                      </h1>
                    </div>

                    {/* Título do documento — bloco central */}
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                      <h2 className="text-[22px] font-bold leading-tight text-foreground uppercase max-w-[560px]">
                        {documentTitle}
                      </h2>
                      <p className="text-sm italic text-muted-foreground mt-3">
                        {documentSubtitle}
                      </p>

                      {/* Badge de status */}
                      <div
                        className="inline-flex items-center gap-2 mt-8 px-6 py-2.5 rounded-full border"
                        style={{ borderColor: `${statusZone.color}40`, backgroundColor: `${statusZone.color}10` }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: statusZone.color }}
                        />
                        <span className="text-sm font-semibold text-foreground">
                          {statusZone.label} — {completionPct}% concluído
                        </span>
                      </div>

                      {/* Bloco EMPRESA / PERÍODO / EMISSÃO */}
                      <div className="grid grid-cols-3 gap-8 mt-12 max-w-[560px] w-full">
                        <div className="text-center">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Empresa</p>
                          <p className="text-sm font-semibold text-foreground leading-tight">Recuperanda</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Período</p>
                          <p className="text-sm font-semibold text-foreground leading-tight">Mensal</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Emissão</p>
                          <p className="text-sm font-semibold text-foreground leading-tight">{issueDate}</p>
                        </div>
                      </div>

                      <div className="w-full max-w-[560px] h-px bg-border mt-10" />

                      {/* Responsável Técnico */}
                      <div className="mt-6 text-center">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                          Responsável Técnico
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          Auditor Contábil Sênior IA
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Platafoprospecção BEx — Brasil Expert
                        </p>
                      </div>
                    </div>

                    {/* Linha azul decorativa no rodapé */}
                    <div className="h-0.5 w-full bg-[hsl(210,60%,30%)]/60 mt-6 mb-2" />
                  </div>
                </A4Page>

                {/* === PAGE 2: SUMÁRIO === */}
                <A4Page>
                  <div className="space-y-5">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Brasil Expert · BEx</p>
                      <h2 className="text-xl font-bold text-[hsl(210,60%,30%)] tracking-wide mt-1">SUMÁRIO</h2>
                      <div className="w-12 h-0.5 bg-[hsl(210,60%,30%)] mt-2" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {documentTitle} — {blocks.length} capítulos · Emissão {issueDate}
                    </p>
                    <div className="space-y-1 mt-4">
                      {blocks.map((block, i) => (
                        <button
                          key={block.id}
                          onClick={() => scrollToBlock(block.id)}
                          className="w-full text-left flex items-center gap-3 text-xs text-foreground hover:bg-muted/40 transition-colors py-2 px-1 border-b border-dotted border-muted/60 cursor-pointer group"
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${bulletClass(block.status)}`} />
                          <span className="text-muted-foreground font-mono text-[10px] w-6">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="flex-1 group-hover:text-[hsl(210,60%,30%)] transition-colors">
                            {block.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            pg. {i + 3}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </A4Page>

                {/* === CONTENT PAGES === */}
                {blocks.map((block, i) => {
                  const st = statusLabel[block.status] || statusLabel.pending;
                  const isCompleted = block.status === "completed";

                  return (
                    <div key={block.id} ref={(el) => { blockRefs.current[block.id] = el; }}>
                      <A4Page>
                        <div className="space-y-4 group">
                          <div className="flex items-start justify-between">
                            <h3 className="text-sm font-bold text-[hsl(210,60%,30%)] uppercase">
                              {i + 1}. {block.title}
                            </h3>
                            {block.status !== "pending" && (
                              <Badge className="text-[10px] border-0 shrink-0" style={{ backgroundColor: `${st.color}20`, color: st.color }}>
                                <Check className="w-3 h-3 mr-1" /> {st.label}
                              </Badge>
                            )}
                          </div>
                          <div className="w-full h-px bg-[hsl(210,60%,30%)]/20" />
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{block.content}</p>

                          {/* Inline actions */}
                          {!readOnly && (
                            <div className="flex items-center gap-1 mt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!isCompleted && (
                                <Button size="sm" variant="ghost" className="text-[10px] h-6 gap-1 text-[hsl(142,76%,30%)]"
                                  onClick={() => onUpdateBlock(block.id, { status: "completed" })}>
                                  <CheckCircle2 className="w-3 h-3" /> Concluir
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="text-[10px] h-6 gap-1"
                                onClick={() => setCommentingId(commentingId === block.id ? null : block.id)}>
                                <MessageSquare className="w-3 h-3" />
                                {block.comments.length > 0 ? `${block.comments.length}` : "Comentar"}
                              </Button>
                            </div>
                          )}

                          {/* Inline comment input */}
                          {commentingId === block.id && !readOnly && (
                            <div className="flex gap-2 mt-2">
                              <Textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                                placeholder="Adicionar comentário..." className="min-h-[50px] text-xs flex-1" />
                              <Button size="sm" className="self-end h-8 bg-[hsl(217,91%,50%)] text-white"
                                onClick={() => handleSubmitComment(block.id)}>
                                <Send className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </A4Page>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Annotations sidebar */}
          <div className="w-[280px] shrink-0">
            <div className="sticky top-0">
              <div className="bg-card border rounded-lg">
                <div className="p-3 border-b">
                  <h3 className="text-xs font-semibold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-[hsl(217,91%,50%)]" />
                    Marcações & Comentários
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {annotatedBlocks.length} de {blocks.length} tópicos com anotações
                  </p>
                </div>
                <ScrollArea className="h-[calc(100vh-480px)]">
                  <div className="p-2 space-y-2">
                    {annotatedBlocks.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center py-6">
                        Nenhuma marcação ou comentário registrado.
                      </p>
                    ) : (
                      annotatedBlocks.map((block) => {
                        const st = statusLabel[block.status] || statusLabel.pending;
                        const idx = blocks.findIndex(b => b.id === block.id);
                        return (
                          <div key={block.id} className="border rounded-md p-2.5 space-y-1.5 bg-muted/20">
                            {/* Topic header */}
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-semibold truncate flex-1">
                                {idx + 1}. {block.title}
                              </span>
                              <Badge className="text-[8px] px-1.5 py-0 border-0 shrink-0" style={{ backgroundColor: `${st.color}20`, color: st.color }}>
                                {st.label}
                              </Badge>
                            </div>

                            {/* Status info */}
                            {block.status !== "pending" && (
                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                <CheckCircle2 className="w-2.5 h-2.5" style={{ color: st.color }} />
                                <span>Status: {st.label}</span>
                                {block.assignedTo && (
                                  <>
                                    <span className="mx-0.5">•</span>
                                    <User className="w-2.5 h-2.5" />
                                    <span>{block.assignedTo === "usuario" ? "Usuário" : "Coordenador"}</span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Comments list */}
                            {block.comments.length > 0 && (
                              <div className="space-y-1 mt-1">
                                {block.comments.map(c => (
                                  <div key={c.id} className="bg-background rounded p-1.5 border text-[9px]">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="font-medium text-foreground">{c.author}</span>
                                      <span className="text-muted-foreground flex items-center gap-0.5">
                                        <Clock className="w-2 h-2" /> {c.timestamp}
                                      </span>
                                    </div>
                                    <p className="text-muted-foreground leading-snug">{c.text}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>

        {/* Finalize button */}
        {!readOnly && (
          <div className="flex items-center justify-between mt-4 gap-3">
            <p className="text-[11px] text-muted-foreground">
              {completedCount}/{blocks.length} capítulos concluídos
              {finalHint ? <> · <span className="text-foreground/80">{finalHint}</span></> : <> · você pode atualizar o documento a qualquer momento.</>}
            </p>
            <Button onClick={onFinalize}
              disabled={finalDisabled}
              className="rounded-full px-6 bg-gradient-to-r from-[hsl(217,91%,50%)] to-[hsl(262,83%,58%)] text-white disabled:opacity-50 disabled:cursor-not-allowed">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {finalLabel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RelatorioA4View;
