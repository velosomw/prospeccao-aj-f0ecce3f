import { useMemo, useState, useEffect, Fragment } from "react";
import { FolderOpen, FolderX, FolderCheck, FileText, AlertCircle, CheckCircle2, ChevronRight, ChevronDown, File, Loader2, Upload, GraduationCap, ShieldAlert, Hourglass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase-any";
import type { ProspeccaoEntry } from "@/types/prospeccao";
import { DeferredBatchIndicator } from "@/components/prospeccao/DeferredBatchIndicator";
import ProspeccaoFailedFilesLearningCard from "@/components/prospeccao/ProspeccaoFailedFilesLearningCard";
import ProspeccaoManualUploadLearningCard from "@/components/prospeccao/ProspeccaoManualUploadLearningCard";
import ProspeccaoAuditTrailCard from "@/components/prospeccao/ProspeccaoAuditTrailCard";
import ProspeccaoBatchTab from "@/components/prospeccao/ProspeccaoBatchTab";
import { computeProspeccaoScore } from "@/lib/prospeccaoScore";
import { reconcileScore, useScoreParityGuard } from "@/lib/scoreSync";

interface Props {
  prospeccao: ProspeccaoEntry;
  companyId?: string | null;
}

const COLORS = {
  ok: "hsl(142,76%,36%)",
  incompleto: "hsl(38,92%,50%)",
  vazio: "hsl(0,84%,60%)",
  blue: "hsl(217,91%,50%)",
};

type OneDriveFile = { path: string; file_name: string; status?: string | null };

type TopicNorm = {
  id: string;
  name: string;
  pasta: string | number;
  fileCount: number;
  docsParsed: number;
  status: "ok" | "incompleto" | "vazio";
};

const normalizeStatus = (
  raw: any,
  fileCount: number,
  processedCount: number,
): "ok" | "incompleto" | "vazio" => {
  if (fileCount === 0) return "vazio";
  if (processedCount > 0 && processedCount >= fileCount) return "ok";
  const s = String(raw || "").toLowerCase();
  if (s === "completo" || s === "ok") return "ok";
  return "incompleto";
};

const statusBadge = (s: "ok" | "incompleto" | "vazio") => {
  if (s === "ok") return <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-0 text-[10px]">OK</Badge>;
  if (s === "incompleto") return <Badge className="bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-0 text-[10px]">Incompleto</Badge>;
  return <Badge className="bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-0 text-[10px]">Vazio</Badge>;
};

const ProspeccaoProcessamentoTab = ({ prospeccao, companyId }: Props) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [allFiles, setAllFiles] = useState<OneDriveFile[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Carrega arquivos do OneDrive imediatamente (fonte de verdade) e re-busca a cada 5s
  // para refletir o progresso do worker assíncrono em tempo real.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async (showSpinner = false) => {
      if (showSpinner) setLoadingFiles(true);
      const { data } = await supabase
        .from("onedrive_files")
        .select("path, file_name, status")
        .eq("company_id", companyId)
        .neq("status", "inactive")
        .order("path", { ascending: true })
        .limit(2000);
      if (!cancelled) {
        setAllFiles((data as any) || []);
        if (showSpinner) setLoadingFiles(false);
      }
    };
    load(true);
    const interval = window.setInterval(() => load(false), 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [companyId]);

  const toggleTopic = (topicId: string) => {
    setExpanded((prev) => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  const matchTopicFiles = (pasta: string | number): OneDriveFile[] => {
    if (!allFiles) return [];
    const num = String(pasta).padStart(2, "0");
    const numUnpadded = String(pasta);
    const re = new RegExp(`/(${num}|${numUnpadded})[\\s._-]`, "i");
    return allFiles.filter((f) => re.test(f.path));
  };

  const getDocsForTopic = (pasta: string | number, fallback: any[] = []): { name: string; path?: string; status?: string | null }[] => {
    const matched = matchTopicFiles(pasta);
    if (matched.length > 0) {
      return matched.map((f) => ({ name: f.file_name, path: f.path, status: f.status }));
    }
    return (fallback || [])
      .filter((d: any) => d?.name)
      .map((d: any) => ({ name: d.name }));
  };

  const topics: TopicNorm[] = useMemo(() => {
    return (prospeccao.topics || []).map((t: any, i: number) => {
      const docs = Array.isArray(t.documents) ? t.documents : [];
      const pasta = t.pasta ?? t.number ?? i + 1;
      const realFiles = matchTopicFiles(pasta);
      const realCount = realFiles.length;
      const realProcessed = realFiles.filter((f) => f.status === "processed").length;
      const fallbackCount =
        typeof t.fileCount === "number"
          ? t.fileCount
          : docs.filter((d: any) => d?.name).length;
      const fileCount = realCount > 0 ? realCount : fallbackCount;
      const docsParsed =
        realProcessed > 0
          ? realProcessed
          : typeof t.docsParsed === "number"
            ? t.docsParsed
            : docs.filter((d: any) => d?.compliance === "atende").length;
      return {
        id: t.id || `t${i + 1}`,
        name: t.name,
        pasta,
        fileCount,
        docsParsed,
        status: normalizeStatus(t.status, fileCount, docsParsed),
      };
    });
  }, [prospeccao.topics, allFiles]);

  const total = topics.length;
  const okCount = topics.filter((t) => t.status === "ok").length;
  const incompletoCount = topics.filter((t) => t.status === "incompleto").length;
  const vazioCount = topics.filter((t) => t.status === "vazio").length;
  const totalDocs = allFiles ? allFiles.length : topics.reduce((s, t) => s + t.fileCount, 0);

  // Score Global unificado: usa exatamente o mesmo percentual exibido no header
  // do Workspace e nos Alertas Inteligentes (vindo do edge `prospeccao-score` quando
  // disponível). Mantém computeProspeccaoScore como piso defensivo caso `prospeccao.percentual`
  // ainda não tenha sido propagado.
  const localScore = computeProspeccaoScore(
    topics.map((t) => ({
      status: t.status === "ok" ? "completo" : t.status === "incompleto" ? "incompleto" : "pendente",
      completude: t.fileCount > 0 ? Math.round((t.docsParsed / t.fileCount) * 100) : 0,
    })),
    prospeccao.percentual,
  );
  const score = reconcileScore("ProspeccaoProcessamentoTab", prospeccao.percentual, localScore);
  useScoreParityGuard(prospeccao.id ?? null, "ProspeccaoProcessamentoTab", score);

  const okPct = total > 0 ? Math.round((okCount / total) * 100) : 0;
  const incPct = total > 0 ? Math.round((incompletoCount / total) * 100) : 0;
  const vazioPct = total > 0 ? Math.round((vazioCount / total) * 100) : 0;

  const scoreColor =
    score >= 67 ? COLORS.ok : score >= 33 ? COLORS.incompleto : COLORS.vazio;
  const scoreLabel =
    score >= 90
      ? "Documentação Completa"
      : score >= 67
        ? "Recebimento Saudável"
        : score >= 33
          ? "Atenção — Pendências"
          : "Crítico — Muitas pastas vazias";

  const pendentes = topics.filter((t) => t.status !== "ok");

  return (
    <div className="space-y-6">
      {companyId && (
        <DeferredBatchIndicator companyId={companyId} prospeccaoId={(prospeccao as any).id ?? null} variant="prospeccao-summary" />
      )}
      {/* Linha 1 — Score Global + Distribuição por classificação */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Score Global (card grande) */}
        <Card className="lg:col-span-1 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderCheck className="w-4 h-4" style={{ color: COLORS.blue }} />
              Score Global de Recebimento
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center pt-2">
            <div className="text-5xl font-bold" style={{ color: scoreColor }}>
              {score}%
            </div>
            <p className="text-xs font-semibold mt-1" style={{ color: scoreColor }}>
              {scoreLabel}
            </p>
            <Progress
              value={score}
              className="h-2 mt-3"
              style={{ ["--progress-color" as any]: scoreColor }}
            />
            <div className="grid grid-cols-3 gap-2 mt-4 text-[11px]">
              <div>
                <p className="text-muted-foreground">Pastas</p>
                <p className="font-bold text-foreground">{total}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Docs anexados</p>
                <p className="font-bold text-foreground">{totalDocs}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Vazias</p>
                <p className="font-bold" style={{ color: COLORS.vazio }}>{vazioCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Distribuição por classificação (3 mini-cards) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: COLORS.ok }}>
                  <FolderCheck className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-semibold" style={{ color: COLORS.ok }}>OK</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{okPct}%</p>
              <p className="text-[11px] text-muted-foreground">{okCount} de {total} pastas</p>
              <Progress value={okPct} className="h-1.5 mt-2" style={{ ["--progress-color" as any]: COLORS.ok }} />
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: COLORS.incompleto }}>
                  <FolderOpen className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-semibold" style={{ color: COLORS.incompleto }}>Incompleto</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{incPct}%</p>
              <p className="text-[11px] text-muted-foreground">{incompletoCount} de {total} pastas</p>
              <Progress value={incPct} className="h-1.5 mt-2" style={{ ["--progress-color" as any]: COLORS.incompleto }} />
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: COLORS.vazio }}>
                  <FolderX className="w-4 h-4 text-white" />
                </div>
                <span className="text-xs font-semibold" style={{ color: COLORS.vazio }}>Vazio</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{vazioPct}%</p>
              <p className="text-[11px] text-muted-foreground">{vazioCount} de {total} pastas</p>
              <Progress value={vazioPct} className="h-1.5 mt-2" style={{ ["--progress-color" as any]: COLORS.vazio }} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Diagnóstico da IA */}
      <Card className="border-2 border-[hsl(38,92%,50%)]/20 bg-[hsl(38,92%,50%)]/5">
        <CardContent className="p-5">
          <p className="text-sm font-semibold text-foreground mb-2">
            🧠 Diagnóstico da IA — {prospeccao.empresa}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Foram analisadas <strong>{total} pastas</strong> do OneDrive.{" "}
            <strong className="text-[hsl(142,76%,36%)]">{okCount} tópicos completos</strong>,{" "}
            <strong className="text-[hsl(38,92%,50%)]">{incompletoCount} parcialmente documentados</strong> e{" "}
            <strong className="text-[hsl(0,84%,60%)]">{vazioCount} pastas vazias</strong>.
            Score global de recebimento em <strong style={{ color: scoreColor }}>{score}%</strong> — {scoreLabel.toLowerCase()}.
            {pendentes.length > 0
              ? ` Recomenda-se priorizar a complementação das ${pendentes.length} pasta(s) pendente(s) listada(s) abaixo para liberar o avanço da auditoria.`
              : " Documentação completa — pronto para as próximas etapas de análise técnica."}
          </p>
        </CardContent>
      </Card>

      {/* Abas inline: Recebimento por pasta · Pendências de Documentos · Arquivos com erro/pendentes · Upload manual */}
      <Tabs defaultValue="recebimento" className="w-full">
        <TabsList className="bg-muted/40 h-auto p-1 flex-wrap gap-1">
          <TabsTrigger value="recebimento" className="text-xs gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Recebimento por pasta
          </TabsTrigger>
          <TabsTrigger
            value="pendencias"
            className="text-xs gap-1.5 bg-orange-100 text-orange-800 hover:bg-orange-200 data-[state=active]:bg-orange-200 data-[state=active]:text-orange-900"
          >
            <AlertCircle className="w-3.5 h-3.5" /> Pendências de Documentos
            {pendentes.length > 0 && (
              <Badge className="ml-1 h-4 px-1 text-[9px] bg-orange-300/60 text-orange-900 border-0">
                {pendentes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="erros"
            className="text-xs gap-1.5 bg-red-100 text-red-800 hover:bg-red-200 data-[state=active]:bg-red-200 data-[state=active]:text-red-900"
          >
            <GraduationCap className="w-3.5 h-3.5" /> Arquivos com erro / pendentes
          </TabsTrigger>
          <TabsTrigger
            value="manual"
            className="text-xs gap-1.5 bg-blue-100 text-blue-800 hover:bg-blue-200 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900"
          >
            <Upload className="w-3.5 h-3.5" /> Upload manual exigido
          </TabsTrigger>
          <TabsTrigger
            value="trilha"
            className="text-xs gap-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 data-[state=active]:bg-gray-200 data-[state=active]:text-gray-900"
          >
            <ShieldAlert className="w-3.5 h-3.5" /> Trilha de Auditoria
          </TabsTrigger>
          <TabsTrigger
            value="batch"
            className="text-xs gap-1.5 bg-purple-100 text-purple-800 hover:bg-purple-200 data-[state=active]:bg-purple-200 data-[state=active]:text-purple-900"
          >
            <Hourglass className="w-3.5 h-3.5" /> Batch & Fila
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recebimento" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: COLORS.blue }} />
                Recebimento por Pasta — {total} tópicos OneDrive
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-border/50">
                      <th className="w-8"></th>
                      <th className="text-center py-2 px-2 text-[10px] font-semibold text-muted-foreground w-12">📁</th>
                      <th className="text-center py-2 px-2 text-[10px] font-semibold text-muted-foreground w-10">#</th>
                      <th className="text-left py-2 px-2 text-[10px] font-semibold text-muted-foreground">Tópico (Pasta)</th>
                      <th className="text-center py-2 px-2 text-[10px] font-semibold text-muted-foreground w-20">Docs</th>
                      <th className="text-center py-2 px-2 text-[10px] font-semibold text-muted-foreground w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topics.map((t) => {
                      const color = COLORS[t.status];
                      const Icon = t.status === "ok" ? FolderCheck : t.status === "incompleto" ? FolderOpen : FolderX;
                      const isOpen = !!expanded[t.id];
                      const docs = isOpen ? getDocsForTopic(t.pasta, (prospeccao.topics?.find((x: any) => (x.id || "") === t.id) as any)?.documents) : [];
                      return (
                        <Fragment key={t.id}>
                          <tr className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                            <td className="py-2 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => toggleTopic(t.id)}
                                className="w-6 h-6 rounded hover:bg-muted/50 inline-flex items-center justify-center transition-colors"
                                aria-label={isOpen ? "Esconder documentos" : "Abrir documentos"}
                                disabled={t.fileCount === 0}
                              >
                                {isOpen ? (
                                  <ChevronDown className="w-4 h-4 text-foreground" />
                                ) : (
                                  <ChevronRight className={`w-4 h-4 ${t.fileCount === 0 ? "text-muted-foreground/30" : "text-muted-foreground"}`} />
                                )}
                              </button>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <div className="w-7 h-7 rounded-md flex items-center justify-center mx-auto" style={{ backgroundColor: color }}>
                                <Icon className="w-3.5 h-3.5 text-white" />
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className="font-mono text-xs font-bold text-muted-foreground">{t.pasta}</span>
                            </td>
                            <td className="py-2 px-2">
                              <p className="text-xs font-medium text-foreground leading-tight">{t.name}</p>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className="text-xs font-semibold" style={{ color }}>
                                {t.docsParsed > 0 ? `${t.docsParsed}/${t.fileCount}` : t.fileCount}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              {statusBadge(t.status)}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-muted/20 border-b border-border/10">
                              <td></td>
                              <td colSpan={5} className="py-2 px-2">
                                {loadingFiles && allFiles === null ? (
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Carregando documentos…
                                  </div>
                                ) : docs.length === 0 ? (
                                  <p className="text-[11px] text-muted-foreground py-1">
                                    Nenhum documento encontrado nesta pasta.
                                  </p>
                                ) : (
                                  <ul className="space-y-1 py-1">
                                    {docs.map((d, i) => {
                                      const st = (d as any).status as string | undefined;
                                      const stColor =
                                        st === "processed" ? COLORS.ok :
                                        st === "error" ? COLORS.vazio :
                                        st === "processing" ? COLORS.blue :
                                        st === "queued" ? "hsl(262,83%,58%)" :
                                        st === "tracked" ? "hsl(215,16%,47%)" :
                                        COLORS.incompleto;
                                      const stLabel =
                                        st === "processed" ? "lido" :
                                        st === "error" ? "erro" :
                                        st === "processing" ? "processando" :
                                        st === "queued" ? "na fila" :
                                        st === "tracked" ? "pendente" :
                                        st || "—";
                                      const stIcon =
                                        st === "processed" ? "✓" :
                                        st === "error" ? "✕" :
                                        st === "processing" ? "⟳" :
                                        st === "queued" ? "⏵" :
                                        st === "tracked" ? "◷" :
                                        "•";
                                      const stStyle =
                                        st === "tracked"
                                          ? { backgroundColor: "transparent", color: stColor, border: `1px dashed ${stColor}` }
                                          : st === "queued"
                                          ? { backgroundColor: `${stColor}15`, color: stColor, border: `1px solid ${stColor}40` }
                                          : st === "processing"
                                          ? { backgroundColor: `${stColor}20`, color: stColor, border: `1px solid ${stColor}` }
                                          : { backgroundColor: `${stColor}20`, color: stColor, border: "1px solid transparent" };
                                      return (
                                        <li key={`${d.name}-${i}`} className="flex items-start gap-2 text-[11px] text-foreground">
                                          <File className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                          <span className="break-all leading-tight flex-1">{d.name}</span>
                                          {st && (
                                            <span
                                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 inline-flex items-center gap-1"
                                              style={stStyle}
                                            >
                                              <span aria-hidden>{stIcon}</span>
                                              {stLabel}
                                            </span>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {topics.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                          Nenhum tópico encontrado. Execute a análise IA para sincronizar com o OneDrive.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendencias" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {pendentes.length > 0 ? (
                  <AlertCircle className="w-4 h-4" style={{ color: COLORS.incompleto }} />
                ) : (
                  <CheckCircle2 className="w-4 h-4" style={{ color: COLORS.ok }} />
                )}
                Pendências de Documentos — {pendentes.length} {pendentes.length === 1 ? "pasta" : "pastas"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendentes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  ✓ Todas as pastas possuem ao menos um documento anexado.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pendentes.map((t) => {
                    const color = COLORS[t.status];
                    const Icon = t.status === "vazio" ? FolderX : FolderOpen;
                    const msg = t.status === "vazio"
                      ? "Pasta sem documentos no OneDrive"
                      : `${t.fileCount} doc(s) — anexar complementares`;
                    return (
                      <div
                        key={t.id}
                        className="flex items-start gap-2 p-2.5 rounded-md border border-border/40 hover:bg-muted/20 transition-colors"
                      >
                        <div
                          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          <Icon className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-foreground leading-tight truncate">
                            <span className="font-mono text-muted-foreground mr-1">#{t.pasta}</span>
                            {t.name}
                          </p>
                          <p className="text-[10px] mt-0.5" style={{ color }}>
                            {msg}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="erros" className="mt-4">
          {companyId && <ProspeccaoFailedFilesLearningCard companyId={companyId} />}
        </TabsContent>

        <TabsContent value="manual" className="mt-4">
          {companyId && <ProspeccaoManualUploadLearningCard companyId={companyId} />}
        </TabsContent>

        <TabsContent value="trilha" className="mt-4">
          {companyId && <ProspeccaoAuditTrailCard companyId={companyId} />}
        </TabsContent>

        <TabsContent value="batch" className="mt-4">
          <ProspeccaoBatchTab companyId={companyId ?? null} prospeccaoId={(prospeccao as any).id ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProspeccaoProcessamentoTab;
