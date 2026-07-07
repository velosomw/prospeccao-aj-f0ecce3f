import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { FileText, Lock, Download, AlertCircle, Printer, ShieldAlert, Unlock, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { toast } from "sonner";
import SectionPendenciesPanel from "@/components/rma/document/SectionPendenciesPanel";

interface DocRow {
  id: string;
  titulo: string;
  status: string;
  progresso: number;
  arquivo_final_url: string | null;
  arquivo_final_versao: number | null;
  arquivo_final_gerado_em: string | null;
  arquivo_final_pct: number | null;
  released_to_recuperanda_at: string | null;
  released_to_recuperanda_by: string | null;
  released_to_recuperanda_notes: string | null;
}

interface SectionRow {
  id: string;
  numero: string | null;
  titulo: string;
  conteudo_editado: string | null;
  conteudo_ia: string | null;
  status: string;
  grounding_score?: number | null;
  ungrounded_claims?: any;
}

type DocTipo = "parecer_tecnico" | "rma_mensal" | "rma_mensal_dip" | "rma_intelligence";
interface Props { tipo?: DocTipo; titulo?: string }

const RMAParecerFinalTab = ({ tipo: tipoInicial = "rma_intelligence", titulo = "Relatório Final RMA" }: Props) => {
  // Templates suportados: legado CNJ 72, DIP (Capital AJ) e Intelligence Engine (v3, padrão).
  const [tipo, setTipo] = useState<DocTipo>(tipoInicial);
  const { id = "" } = useParams();
  const { roles } = useUserRoles();
  const isRecuperanda = roles.includes("recuperanda");
  const isMagistrado = roles.includes("magistrado");
  const canRelease = roles.includes("coordenador") || roles.includes("gestor_ia");
  const [doc, setDoc] = useState<DocRow | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const reload = async () => {
    if (!id) return;
    const { data: d } = await supabase
      .from("rma_documents")
      .select("id, titulo, status, progresso, arquivo_final_url, arquivo_final_versao, arquivo_final_gerado_em, arquivo_final_pct, released_to_recuperanda_at, released_to_recuperanda_by, released_to_recuperanda_notes")
      .eq("rma_id", id)
      .eq("tipo", tipo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setDoc((d as DocRow) || null);
    if (d?.id) {
      const { data: s } = await supabase
        .from("rma_document_sections")
        .select("id, numero, titulo, conteudo_editado, conteudo_ia, status, grounding_score, ungrounded_claims")
        .eq("document_id", d.id)
        .order("ordem", { ascending: true });
      setSections((s || []) as any);
    } else {
      setSections([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await reload();
        if (cancelled) return;
        // Auto-migração: template ativo = Intelligence Engine. Se ainda não há documento
        // neste template para o RMA, mas existe um legado (rma_mensal_dip / rma_mensal),
        // migra automaticamente para o ajustado sem exigir clique manual.
        if (tipo === "rma_intelligence" && id && canRelease) {
          const { data: existing } = await supabase
            .from("rma_documents")
            .select("id, tipo")
            .eq("rma_id", id)
            .in("tipo", ["rma_intelligence", "rma_mensal_dip", "rma_mensal"]);
          const hasIntel = (existing || []).some((d: any) => d.tipo === "rma_intelligence");
          const legacy = (existing || []).find((d: any) => d.tipo === "rma_mensal_dip")
            || (existing || []).find((d: any) => d.tipo === "rma_mensal");
          if (!cancelled && !hasIntel && legacy) {
            await handleInitDip(true, "rma_intelligence");
          }
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, tipo, canRelease]);

  const isFinalized = doc?.status === "finalizado" || (doc?.progresso ?? 0) >= 100;
  const hasFile = !!doc?.arquivo_final_url;
  const isReleased = !!doc?.released_to_recuperanda_at;
  // Recuperanda e Magistrado só veem o conteúdo após a liberação do Coordenador
  // (a liberação para a Recuperanda libera automaticamente para o Magistrado)
  const blockedForViewer = (isRecuperanda || isMagistrado) && !isReleased;
  const blockedForRecuperanda = blockedForViewer;

  const handleToggleRelease = async (release: boolean) => {
    if (!doc?.id) return;
    setReleasing(true);
    try {
      const { error } = await supabase.rpc("set_rma_document_recuperanda_release", {
        p_document_id: doc.id,
        p_release: release,
        p_notes: null,
      });
      if (error) throw error;
      toast.success(release ? "Relatório liberado para a Recuperanda." : "Liberação revogada.");
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar liberação.");
    } finally {
      setReleasing(false);
    }
  };

  const handleInitDip = async (migrate: boolean, targetTipo: DocTipo = "rma_intelligence") => {
    if (!id) return;
    setInitializing(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const tituloMap: Record<string, string> = {
        rma_intelligence: "RMA Mensal — Intelligence Engine (v3)",
        rma_mensal_dip: "RMA Mensal — DIP (Capital AJ)",
        rma_mensal: "Relatório Mensal de Atividades",
        parecer_tecnico: "Parecer Técnico Contábil",
      };
      const { data, error } = await supabase.functions.invoke("rma-doc-init", {
        body: {
          rma_id: id,
          tipo: targetTipo,
          titulo: tituloMap[targetTipo],
          created_by: u?.user?.id,
          copy_from_tipo: migrate ? (targetTipo === "rma_intelligence" ? "rma_mensal_dip" : "rma_mensal") : undefined,
        },
      });
      if (error) throw error;
      toast.success(
        (data as any)?.reused
          ? "Documento já existente — reaproveitado."
          : migrate
            ? "Documento criado e conteúdo migrado do template anterior."
            : "Documento criado.",
      );
      await reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar documento.");
    } finally {
      setInitializing(false);
    }
  };

  // Alertas de governança (MD: "inconsistências destacadas", "dados não conciliados")
  const lowGrounding = sections.filter((s) => (s.conteudo_editado || s.conteudo_ia) && (s.grounding_score ?? 0) < 50);
  const withUngrounded = sections.filter((s) => Array.isArray(s.ungrounded_claims) && s.ungrounded_claims.length > 0);
  const empty = sections.filter((s) => !s.conteudo_editado && !s.conteudo_ia);

  const exportPDF = () => {
    window.print();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-[hsl(142,76%,36%)]" /> {titulo}
            {doc && (
              <span className="text-xs text-muted-foreground font-normal">
                · v{doc.arquivo_final_versao ?? 1} · {doc.progresso ?? 0}% concluído
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {tipoInicial !== "parecer_tecnico" && (
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as DocTipo)}
                className="text-xs border rounded-md px-2 py-1 bg-background text-foreground"
                title="Template do Prospecção AJ"
              >
                <option value="rma_intelligence">Prospecção AJ Intelligence Engine (v3, padrão)</option>
                <option value="rma_mensal_dip">Prospecção AJ Mensal — DIP (Capital AJ)</option>
                <option value="rma_mensal">Prospecção AJ Mensal (CNJ 72 — legado)</option>
              </select>
            )}
            {isFinalized && (
              <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-0 text-xs gap-1">
                <Lock className="w-3 h-3" /> Versão Final
              </Badge>
            )}
            {(tipo === "rma_mensal" || tipo === "rma_mensal_dip" || tipo === "rma_intelligence") && doc && (
              isReleased ? (
                <Badge className="bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)] border-0 text-xs gap-1">
                  <Unlock className="w-3 h-3" /> Liberado p/ Recuperanda
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                  <Lock className="w-3 h-3" /> Não liberado p/ Recuperanda
                </Badge>
              )
            )}
            {canRelease && (tipo === "rma_mensal" || tipo === "rma_mensal_dip" || tipo === "rma_intelligence") && doc && (
              <Button
                size="sm"
                variant={isReleased ? "outline" : "default"}
                className="gap-1.5"
                onClick={() => handleToggleRelease(!isReleased)}
                disabled={releasing}
              >
                {isReleased ? <Lock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                {isReleased ? "Revogar liberação" : "Liberar p/ Recuperanda"}
              </Button>
            )}
            {sections.length > 0 && !blockedForRecuperanda && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={exportPDF}>
                <Printer className="w-3.5 h-3.5" /> Exportar PDF
              </Button>
            )}
            {hasFile && !blockedForRecuperanda && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={doc!.arquivo_final_url!} target="_blank" rel="noreferrer">
                  <Download className="w-3.5 h-3.5" /> Baixar .docx
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {blockedForRecuperanda ? (
          <div className="bg-muted/30 border rounded-lg p-10 text-center">
            <Lock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Relatório Prospecção AJ Final ainda não liberado</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              O Coordenador ainda não liberou este Relatório Mensal de Atividades para visualização.
              Você será notificada assim que ele estiver disponível.
            </p>
          </div>
        ) : (
        <>
        {/* Banner de Governança */}
        {(lowGrounding.length > 0 || withUngrounded.length > 0 || empty.length > 0) && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs space-y-1 print:hidden">
            <p className="font-semibold text-amber-800 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Alertas de Governança
            </p>
            {empty.length > 0 && (
              <p className="text-amber-700">• {empty.length} seção(ões) sem conteúdo — documentos podem estar faltando.</p>
            )}
            {lowGrounding.length > 0 && (
              <p className="text-amber-700">• {lowGrounding.length} seção(ões) com baixa ancoragem (&lt; 50/100) — revisar fontes.</p>
            )}
            {withUngrounded.length > 0 && (
              <p className="text-amber-700">• {withUngrounded.length} seção(ões) com valores não conciliados.</p>
            )}
          </div>
        )}

        {/* Pendências detalhadas por seção, com referência à fonte canônica do modelo DIP */}
        {doc && sections.length > 0 && (
          <div className="mb-4 print:hidden">
            <SectionPendenciesPanel documentId={doc.id} tipo={tipo} sections={sections as any} />
          </div>
        )}



        {loading ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Carregando documento…</p>
        ) : !doc ? (
          <div className="bg-muted/30 border rounded-lg p-8 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {tipo === "parecer_tecnico"
                ? <>Nenhum <b>Parecer Técnico Contábil</b> criado ainda. Inicie pela aba <b>Revisão-Parecer Técnico</b>; ao atingir 100% de seções aprovadas, o Parecer Técnico Final é emitido automaticamente em .docx.</>
                : tipo === "rma_intelligence"
                  ? <>Nenhum <b>Prospecção AJ Intelligence Engine (v3)</b> criado ainda. O relatório é gerado por evidências em 5 blocos por capítulo (Dados extraídos · Evidências · Validação · Análise IA · Conclusão IA), com Sumário Executivo, Health Score e Risco Global. Ao atingir 70% de seções aprovadas, o Prospecção AJ Final é emitido automaticamente em .docx.</>
                  : tipo === "rma_mensal_dip"
                    ? <>Nenhum <b>Prospecção AJ Mensal — DIP (Capital AJ)</b> criado ainda. Use o template <b>rma_mensal_dip</b> para iniciar o documento institucional. Ao atingir 70% de seções aprovadas, o Prospecção AJ Final é emitido automaticamente em .docx.</>
                    : <>Nenhum <b>Relatório Mensal de Atividades</b> (CNJ 72/2020) criado ainda. Ao atingir 90% de seções aprovadas, o Prospecção AJ Final é emitido automaticamente em .docx.</>}
            </p>
            {(tipo === "rma_intelligence" || tipo === "rma_mensal_dip") && canRelease && (
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                <Button size="sm" onClick={() => handleInitDip(false, tipo)} disabled={initializing} className="gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Criar documento
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleInitDip(true, tipo)} disabled={initializing} className="gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Migrar do template anterior
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div ref={printRef} className="bg-white border rounded-lg p-8 space-y-6 text-sm leading-relaxed text-foreground max-h-[700px] overflow-y-auto print:max-h-none print:border-0 print:shadow-none">
            <div className="text-center border-b pb-4">
              <h2 className="text-lg font-bold uppercase">{doc.titulo}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Versão {doc.arquivo_final_versao ?? 1} · Gerado em {doc.arquivo_final_gerado_em ? new Date(doc.arquivo_final_gerado_em).toLocaleString("pt-BR") : "—"}
              </p>
            </div>
            {sections.map((s) => {
              const score = s.grounding_score ?? 0;
              const hasContent = !!(s.conteudo_editado || s.conteudo_ia);
              const ung = Array.isArray(s.ungrounded_claims) ? s.ungrounded_claims : [];
              return (
                <div key={s.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">
                      {s.numero ? `${s.numero} ` : ""}{s.titulo}
                    </h3>
                    {hasContent && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] print:hidden ${
                          score >= 80
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : score >= 50
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        Grounding {score}/100
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs whitespace-pre-wrap text-foreground/90">
                    {s.conteudo_editado || s.conteudo_ia || <span className="italic text-muted-foreground">(sem conteúdo)</span>}
                  </div>
                  {ung.length > 0 && (
                    <p className="text-[10px] text-amber-700 mt-1 print:hidden">
                      ⚠ {ung.length} valor(es) sem origem identificada nesta seção.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </>
        )}
      </CardContent>
    </Card>
  );
};

export default RMAParecerFinalTab;
