import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Check, Edit3, RefreshCw, MessageSquare, UserPlus, CheckCircle2,
  Sparkles, Clock, FileText, Loader2, ChevronRight, Send, Undo2, Lock, FileCheck2,
  ShieldCheck, BarChart3,
} from "lucide-react";
import { useRmaDocument, type SectionStatus } from "@/hooks/useRmaDocument";
import SectionGovernanceCard from "./SectionGovernanceCard";
import { useUserRoles, getSectionPermissions, type SectionPermission } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

/** Botão sensível à permissão: desabilita + tooltip e loga tentativa bloqueada se clicado */
const PermButton = ({
  perm, onClick, children, sectionId, documentId, action, primaryRole,
  size = "sm", variant = "outline", className = "",
}: {
  perm: SectionPermission;
  onClick: () => void;
  children: React.ReactNode;
  sectionId?: string;
  documentId?: string;
  action: string;
  primaryRole: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
  className?: string;
}) => {
  const handle = () => {
    if (perm.allowed) return onClick();
    // Loga tentativa bloqueada (UI-side) — backend também loga ao tentar RPC
    supabase.from("prospecção_section_audit_log").insert({
      section_id: sectionId,
      document_id: documentId,
      user_role: primaryRole,
      action: "blocked",
      reason: "ui_disabled_click",
      error_message: perm.reason ?? "Ação não permitida",
      metadata: { ui_action: action },
    });
  };
  const btn = (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={!perm.allowed}
      onClick={handle}
    >
      {children}
    </Button>
  );
  if (perm.allowed) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-block">{btn}</span></TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{perm.reason}</TooltipContent>
    </Tooltip>
  );
};

interface Props {
  tipo: "parecer_tecnico" | "prospecção_mensal";
  titulo: string;
}

const STATUS_META: Record<SectionStatus, { label: string; cls: string; dot: string }> = {
  pendente:   { label: "Pendente",   cls: "bg-red-500/10 text-red-600 border-red-200",       dot: "bg-red-500" },
  em_edicao:  { label: "Em edição",  cls: "bg-amber-500/10 text-amber-600 border-amber-200", dot: "bg-amber-500" },
  revisado:   { label: "Revisado",   cls: "bg-sky-500/10 text-sky-600 border-sky-200",       dot: "bg-sky-500" },
  aprovado:   { label: "Aprovado",   cls: "bg-emerald-500/10 text-emerald-600 border-emerald-200", dot: "bg-emerald-500" },
  concluido:  { label: "Concluído",  cls: "bg-emerald-600/15 text-emerald-700 border-emerald-300", dot: "bg-emerald-600" },
};

const RmaIntelligentEditor = ({ tipo, titulo }: Props) => {
  const { id: prospecçãoId = "" } = useParams();
  const {
    doc, sections, comments, loading, busySectionId, progresso,
    bulkGenerating, bulkProgress,
    generateSection, regenerateWithFeedback, buildCharts,
    generateAllSections, updateContent, setStatus, assignTo, addComment, consolidate, regenerateFinal,
  } = useRmaDocument(prospecçãoId, tipo, titulo);
  const userRoles = useUserRoles();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteHint, setRewriteHint] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [motivoDialog, setMotivoDialog] = useState<null | { kind: "devolver" | "reabrir"; targetStatus: "em_edicao" }>(null);
  const [motivoText, setMotivoText] = useState("");

  const selected = useMemo(
    () => sections.find((s) => s.id === selectedId) || null,
    [sections, selectedId],
  );

  const onSelect = (id: string) => {
    const s = sections.find((x) => x.id === id);
    setSelectedId(id);
    setDraft(s?.conteudo_editado ?? s?.conteudo_ia ?? "");
  };

  const totalsByStatus = useMemo(() => {
    const c = { pendente: 0, em_edicao: 0, revisado: 0, aprovado: 0, concluido: 0 } as Record<SectionStatus, number>;
    sections.forEach((s) => (c[s.status] = (c[s.status] || 0) + 1));
    return c;
  }, [sections]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando documento…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dashboard de progresso */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[hsl(217,91%,50%)]/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[hsl(217,91%,50%)]" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{doc?.titulo}</h3>
              <p className="text-xs text-muted-foreground">
                {sections.length} seções · {totalsByStatus.concluido} concluídas · {totalsByStatus.em_edicao} em edição · {totalsByStatus.pendente} pendentes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 min-w-[260px] flex-1 max-w-md">
            <Progress value={progresso} className="h-2 flex-1" />
            <span className="text-sm font-semibold tabular-nums">{progresso}%</span>
            <Button
              size="sm"
              variant="default"
              className="bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(217,91%,50%)] text-white"
              disabled={bulkGenerating || sections.every((s) => !!(s.conteudo_ia || s.conteudo_editado))}
              onClick={() => generateAllSections()}
            >
              {bulkGenerating ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Gerando {bulkProgress?.done}/{bulkProgress?.total}…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-1" /> Gerar tudo com IA</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!doc}
              onClick={() => buildCharts(true)}
            >
              <BarChart3 className="w-4 h-4 mr-1" /> Gerar gráficos
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!doc || sections.some((s) => s.status !== "aprovado" && s.status !== "concluido")}
              onClick={() => doc && consolidate(doc.id)}
            >
              <FileCheck2 className="w-4 h-4 mr-1" /> Consolidar
            </Button>
          </div>
        </div>

        {bulkGenerating && bulkProgress && (
          <div className="mt-3">
            <Progress value={(bulkProgress.done / bulkProgress.total) * 100} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1">
              Gerando seções via IA — {bulkProgress.done} de {bulkProgress.total} concluídas. Você pode acompanhar pelo sumário lateral.
            </p>
          </div>
        )}

        {/* Faixa do documento Final em .docx */}
        {(() => {
          const okPct = sections.length
            ? Math.round((sections.filter((s) => s.status === "aprovado" || s.status === "concluido").length / sections.length) * 100)
            : 0;
          const canGen = okPct >= 90;
          const finalNome = tipo === "prospecção_mensal" ? "Prospeccao Final" : "Parecer Técnico Final";
          return (
            <div className={`mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
              doc?.arquivo_final_url
                ? "bg-emerald-50 border-emerald-200"
                : canGen
                ? "bg-sky-50 border-sky-200"
                : "bg-muted/40 border-border"
            }`}>
              <div className="flex items-center gap-2 text-xs">
                <FileCheck2 className={`w-4 h-4 ${doc?.arquivo_final_url ? "text-emerald-600" : "text-muted-foreground"}`} />
                {doc?.arquivo_final_url ? (
                  <span>
                    {finalNome} disponível — <strong>v{doc.arquivo_final_versao}</strong> ·{" "}
                    {doc.arquivo_final_pct}% concluído ·{" "}
                    {doc.arquivo_final_gerado_em
                      ? new Date(doc.arquivo_final_gerado_em).toLocaleString("pt-BR")
                      : ""}
                  </span>
                ) : canGen ? (
                  <span>{okPct}% das seções aprovadas — pronto para gerar {finalNome}.</span>
                ) : (
                  <span>
                    {finalNome} é gerado automaticamente quando atingir 90% (atual: {okPct}%).
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={canGen ? "default" : "outline"}
                  disabled={!doc}
                  onClick={() => regenerateFinal(true)}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  {doc?.arquivo_final_url ? "Regerar" : "Gerar agora"}
                </Button>
              </div>
            </div>
          );
        })()}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* Sumário lateral */}
        <Card className="p-2 lg:sticky lg:top-4 self-start">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-1 p-2">
              {sections.map((s) => {
                const meta = STATUS_META[s.status];
                const isChild = !!s.parent_id;
                const active = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    className={`w-full text-left flex items-start gap-2 px-2 py-2 rounded-md text-xs transition-colors border ${
                      active
                        ? "border-[hsl(217,91%,50%)]/40 bg-[hsl(217,91%,50%)]/5"
                        : "border-transparent hover:bg-muted/50"
                    } ${isChild ? "pl-6" : ""}`}
                  >
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                    <span className="flex-1 leading-snug">
                      <span className="text-muted-foreground">{s.numero}</span>{" "}
                      <span className="font-medium">{s.titulo}</span>
                    </span>
                    {active && <ChevronRight className="w-3 h-3 mt-1 text-[hsl(217,91%,50%)]" />}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        {/* Painel da seção */}
        <Card className="p-5 min-h-[60vh]">
          {!selected && (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Selecione uma seção no sumário para começar.
            </div>
          )}
          {selected && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">{selected.numero}</p>
                  <h2 className="text-lg font-semibold">{selected.titulo}</h2>
                  {selected.prompt_contexto && (
                    <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                      <span className="font-medium">Escopo IA:</span> {selected.prompt_contexto}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className={`${STATUS_META[selected.status].cls} text-[11px]`}>
                  {STATUS_META[selected.status].label}
                </Badge>
              </div>

              {/* Governança: grounding, KPIs, gráficos, fontes */}
              {(selected.conteudo_ia || selected.conteudo_editado) && (
                <div className="space-y-2">
                  <SectionGovernanceCard
                    sectionId={selected.id}
                    graficosIds={Array.isArray(selected.graficos_ids) ? (selected.graficos_ids as string[]) : []}
                    groundingScore={Number(selected.grounding_score || 0)}
                    ungroundedClaims={Array.isArray(selected.ungrounded_claims) ? (selected.ungrounded_claims as string[]) : []}
                    kpis={Array.isArray(selected.kpis) ? (selected.kpis as any[]) : []}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busySectionId === selected.id}
                      onClick={() => regenerateWithFeedback(selected.id)}
                    >
                      {busySectionId === selected.id ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Regerando…</>
                      ) : (
                        <><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Regerar com feedback (grounded)</>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Conteúdo IA + Editor */}
              {!selected.conteudo_ia && !selected.conteudo_editado ? (
                <div className="border border-dashed rounded-lg p-6 text-center space-y-3">
                  <Sparkles className="w-6 h-6 mx-auto text-[hsl(217,91%,50%)]" />
                  <p className="text-sm text-muted-foreground">Esta seção ainda não foi gerada pela IA.</p>
                  <Button
                    onClick={() => generateSection(selected.id, "generate")}
                    disabled={busySectionId === selected.id}
                  >
                    {busySectionId === selected.id ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando…</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" /> Gerar com IA</>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  {selected.conteudo_ia && (
                    <div className="bg-muted/40 border rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Texto IA (v{selected.versao_atual})</p>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{selected.conteudo_ia}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Texto editado</p>
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={10}
                      className="text-sm"
                      placeholder="Edite o texto final aqui…"
                    />
                  </div>
                </>
              )}

              {/* Comentários */}
              {(comments[selected.id]?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold">Comentários</p>
                  {comments[selected.id].map((c) => (
                    <div key={c.id} className="border rounded-md p-2 text-xs bg-background">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">{c.author_name}</span>
                        <Badge variant="outline" className="text-[9px]">{c.author_role}</Badge>
                        <Clock className="w-3 h-3 ml-auto" />
                        <span>{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <p>{c.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Ações contextuais (matriz de transições + permissões por role) */}
              <TooltipProvider delayDuration={200}>
                {(() => {
                  const hasContent = !!(selected.conteudo_editado?.trim() || selected.conteudo_ia?.trim() || draft.trim());
                  const perms = getSectionPermissions(selected.status, userRoles, hasContent);
                  const docId = selected.document_id;
                  const sId = selected.id;
                  const role = userRoles.primary;
                  return (
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {/* Sempre visíveis */}
                      <PermButton perm={perms.comment} action="comment" sectionId={sId} documentId={docId} primaryRole={role}
                        onClick={() => setShowComment(true)}>
                        <MessageSquare className="w-3.5 h-3.5 mr-1" /> Comentar
                      </PermButton>
                      <PermButton perm={perms.assign} action="assign" sectionId={sId} documentId={docId} primaryRole={role}
                        onClick={() => assignTo(selected.id, "coordenador")}>
                        <UserPlus className="w-3.5 h-3.5 mr-1" /> Encaminhar
                      </PermButton>

                      {/* pendente */}
                      {selected.status === "pendente" && (
                        <PermButton perm={perms.editManually} action="edit_manually" sectionId={sId} documentId={docId} primaryRole={role}
                          onClick={() => updateContent(selected.id, draft || " ", "em_edicao")}>
                          <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar manualmente
                        </PermButton>
                      )}

                      {/* em_edicao */}
                      {selected.status === "em_edicao" && (
                        <>
                          <PermButton perm={perms.save} action="save" sectionId={sId} documentId={docId} primaryRole={role}
                            onClick={() => updateContent(selected.id, draft)}>
                            <Edit3 className="w-3.5 h-3.5 mr-1" /> Salvar
                          </PermButton>
                          <PermButton perm={perms.rewriteAI} action="rewrite_ai" sectionId={sId} documentId={docId} primaryRole={role}
                            onClick={() => setShowRewrite(true)}>
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refazer (IA)
                          </PermButton>
                          <PermButton perm={perms.sendReview} action="send_review" sectionId={sId} documentId={docId} primaryRole={role}
                            variant="default" className="ml-auto"
                            onClick={async () => {
                              await updateContent(selected.id, draft);
                              await setStatus(selected.id, "revisado");
                            }}>
                            <Send className="w-3.5 h-3.5 mr-1" /> Enviar p/ revisão
                          </PermButton>
                        </>
                      )}

                      {/* revisado */}
                      {selected.status === "revisado" && (
                        <>
                          <PermButton perm={perms.return} action="return" sectionId={sId} documentId={docId} primaryRole={role}
                            onClick={() => { setMotivoDialog({ kind: "devolver", targetStatus: "em_edicao" }); setMotivoText(""); }}>
                            <Undo2 className="w-3.5 h-3.5 mr-1" /> Solicitar ajuste
                          </PermButton>
                          <PermButton perm={perms.approve} action="approve" sectionId={sId} documentId={docId} primaryRole={role}
                            variant="default" className="ml-auto"
                            onClick={() => setStatus(selected.id, "aprovado")}>
                            <Check className="w-3.5 h-3.5 mr-1" /> Aprovar
                          </PermButton>
                        </>
                      )}

                      {/* aprovado */}
                      {selected.status === "aprovado" && (
                        <>
                          <PermButton perm={perms.reopen} action="reopen" sectionId={sId} documentId={docId} primaryRole={role}
                            onClick={() => { setMotivoDialog({ kind: "reabrir", targetStatus: "em_edicao" }); setMotivoText(""); }}>
                            <Undo2 className="w-3.5 h-3.5 mr-1" /> Reabrir
                          </PermButton>
                          <PermButton perm={perms.conclude} action="conclude" sectionId={sId} documentId={docId} primaryRole={role}
                            variant="default" className="ml-auto"
                            onClick={() => setStatus(selected.id, "concluido")}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Concluir
                          </PermButton>
                        </>
                      )}

                      {/* concluido */}
                      {selected.status === "concluido" && (
                        <>
                          <Badge variant="outline" className="bg-emerald-50 border-emerald-200 text-emerald-700">
                            <Lock className="w-3 h-3 mr-1" /> Travada
                          </Badge>
                          <PermButton perm={perms.reopen} action="reopen_locked" sectionId={sId} documentId={docId} primaryRole={role}
                            className="ml-auto"
                            onClick={() => { setMotivoDialog({ kind: "reabrir", targetStatus: "em_edicao" }); setMotivoText(""); }}>
                            <Undo2 className="w-3.5 h-3.5 mr-1" /> Reabrir (Gestor)
                          </PermButton>
                        </>
                      )}
                    </div>
                  );
                })()}
              </TooltipProvider>

            </div>
          )}
        </Card>
      </div>

      {/* Dialog Refazer */}
      <Dialog open={showRewrite} onOpenChange={setShowRewrite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refazer seção com IA</DialogTitle></DialogHeader>
          <Textarea
            value={rewriteHint}
            onChange={(e) => setRewriteHint(e.target.value)}
            rows={4}
            placeholder="Instrução adicional (ex: aprofundar análise de liquidez, comparar com período anterior...)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRewrite(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (selected) {
                  await generateSection(selected.id, "rewrite", rewriteHint);
                  setShowRewrite(false); setRewriteHint("");
                  const s = sections.find((x) => x.id === selected.id);
                  if (s) setDraft(s.conteudo_ia || "");
                }
              }}
            >
              <RefreshCw className="w-4 h-4 mr-1" /> Refazer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Comentário */}
      <Dialog open={showComment} onOpenChange={setShowComment}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar comentário</DialogTitle></DialogHeader>
          <Input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Ex: rever indicador ISG…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComment(false)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (selected && commentText.trim()) {
                  await addComment(selected.id, commentText.trim());
                  setCommentText(""); setShowComment(false);
                }
              }}
            >Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Motivo (devolução / reabertura) */}
      <Dialog open={!!motivoDialog} onOpenChange={(o) => !o && setMotivoDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {motivoDialog?.kind === "devolver" ? "Solicitar ajuste na seção" : "Reabrir seção (justificativa obrigatória)"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={motivoText}
            onChange={(e) => setMotivoText(e.target.value)}
            rows={4}
            placeholder={motivoDialog?.kind === "devolver"
              ? "Descreva o que precisa ser ajustado…"
              : "Explique o motivo para reabrir uma seção já aprovada/concluída…"}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMotivoDialog(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!selected || motivoText.trim().length < 3) return;
                const ok = await setStatus(selected.id, "em_edicao", motivoText.trim());
                if (ok) {
                  if (motivoDialog?.kind === "devolver") {
                    await addComment(selected.id, `[Devolução] ${motivoText.trim()}`);
                  } else {
                    await addComment(selected.id, `[Reabertura] ${motivoText.trim()}`);
                  }
                  setMotivoDialog(null); setMotivoText("");
                }
              }}
            >
              Confiprospecçãor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RmaIntelligentEditor;
