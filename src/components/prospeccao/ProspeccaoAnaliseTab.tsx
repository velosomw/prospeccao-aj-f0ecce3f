import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mail,
  Bell,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FolderX,
  FolderOpen,
  FolderCheck,
  FileText,
  Sparkles,
  RefreshCw,
  FilePlus2,
  Printer,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ProspeccaoEntry } from "@/types/prospeccao";
import logoBrasilExpert from "@/assets/logo-bex-full.jpeg";
import { CobrancaEmailDialog } from "./CobrancaEmailDialog";
import { supabase } from "@/lib/supabase-any";

interface Props {
  prospeccao: ProspeccaoEntry;
}

const COLORS = {
  ok: "hsl(142,76%,36%)",
  incompleto: "hsl(38,92%,50%)",
  vazio: "hsl(0,84%,60%)",
  blue: "hsl(217,91%,50%)",
  navy: "hsl(222,47%,14%)",
};

// Mock determinístico de indicadores de cobrança baseado no id da Prospeccao
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const ProspeccaoAnaliseTab = ({ prospeccao }: Props) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const storageKey = `prospeccao:relatorio-cobranca:${prospeccao.id}`;
  const dataFingerprint = String(prospeccao.dataAtualizacao || prospeccao.percentual || "");

  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [generatedFingerprint, setGeneratedFingerprint] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setGeneratedAt(parsed.generatedAt || null);
        setGeneratedFingerprint(parsed.fingerprint || null);
      } else {
        setGeneratedAt(null);
        setGeneratedFingerprint(null);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const wasGenerated = !!generatedAt;
  const isStale = wasGenerated && generatedFingerprint !== dataFingerprint;

  const handleGenerate = () => {
    setGenerating(true);
    // Pequeno delay para feedback visual de regeneração
    setTimeout(() => {
      const now = new Date().toISOString();
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ generatedAt: now, fingerprint: dataFingerprint })
        );
      } catch {
        /* ignore */
      }
      setGeneratedAt(now);
      setGeneratedFingerprint(dataFingerprint);
      setGenerating(false);
    }, 700);
  };

  const handlePrint = () => {
    const node = reportRef.current;
    if (!node) return;
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) return;
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join("\n");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Registro & Cobrança — ${prospeccao.id}</title>${styles}
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; background: #fff; }
        .page-break { page-break-after: always; break-after: page; }
        .no-print { display: none !important; }
      </style>
    </head><body>${node.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 500);
  };

  const handleDownload = () => {
    const node = reportRef.current;
    if (!node) return;
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join("\n");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Registro & Cobrança — ${prospeccao.id}</title>${styles}
      <style>@page{size:A4;margin:0}body{margin:0;background:#fff}.page-break{page-break-after:always;break-after:page}</style>
    </head><body>${node.outerHTML}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Relatorio-Registro-Cobranca-${prospeccao.id}-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const completos = prospeccao.topics.filter((t: any) => (t.completude ?? 0) === 100);
  const vazios = prospeccao.topics.filter((t: any) => (t.completude ?? 0) === 0);
  const parciais = prospeccao.topics.filter(
    (t: any) => (t.completude ?? 0) > 0 && (t.completude ?? 0) < 100
  );
  const total = prospeccao.topics.length;
  const score = total > 0
    ? Math.round(((completos.length + parciais.length - vazios.length) / total) * 100)
    : 0;
  const scoreSafe = Math.max(0, score);

  // Reais (prospeccao_cobrancas) + fallback determinístico para histórico antigo
  const seed = hash(String(prospeccao.id || prospeccao.empresa || "prospeccao"));
  const [realCobrancas, setRealCobrancas] = useState<{
    total: number;
    comAnexo: number;
    ultima: string | null;
    ultimoAnexo: string | null;
  }>({ total: 0, comAnexo: 0, ultima: null, ultimoAnexo: null });

  const fetchCobrancas = async () => {
    const { data, error } = await (supabase
      .from("prospeccao_cobrancas") as any)
      .select("created_at, has_attachment")
      .eq("prospeccao_id", prospeccao.id)
      .order("created_at", { ascending: false });
    if (error || !data) return;
    const comAnexo = data.filter((d: any) => d.has_attachment).length;
    const ultima = data[0]?.created_at ?? null;
    const ultimoAnexo = data.find((d: any) => d.has_attachment)?.created_at ?? null;
    setRealCobrancas({ total: data.length, comAnexo, ultima, ultimoAnexo });
  };

  useEffect(() => {
    fetchCobrancas();
  }, [prospeccao.id]);

  const fmtDate = (iso: string | null, fb: string) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR") : fb;

  // Contadores 100% reais (associados ao Prospeccao via prospeccao_cobrancas). Sem fallback mock.
  const cobrancas = realCobrancas.total;
  const emails = realCobrancas.total;
  const anexos = realCobrancas.comAnexo;
  const ultimaCobranca = fmtDate(realCobrancas.ultima, "—");
  const ultimoAnexo = fmtDate(realCobrancas.ultimoAnexo, "—");
  const taxaResposta = cobrancas > 0 ? Math.min(100, Math.round((anexos / cobrancas) * 100)) : 0;

  const dataRelatorio = useMemo(
    () => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    []
  );


  return (
    <div className="space-y-6">
      {/* === 3 CARDS PRINCIPAIS === */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4" style={{ borderLeftColor: COLORS.blue }}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.blue}15` }}
              >
                <Bell className="w-5 h-5" style={{ color: COLORS.blue }} />
              </div>
              <Badge className="bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] border-0 text-[10px]">
                Cobranças
              </Badge>
            </div>
            <p className="text-3xl font-bold text-foreground">{cobrancas}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cobranças realizadas para anexar documentos
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Última: <span className="font-semibold text-foreground">{ultimaCobranca}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4" style={{ borderLeftColor: COLORS.incompleto }}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.incompleto}15` }}
              >
                <Mail className="w-5 h-5" style={{ color: COLORS.incompleto }} />
              </div>
              <Badge className="bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,50%)] border-0 text-[10px]">
                E-mails
              </Badge>
            </div>
            <p className="text-3xl font-bold text-foreground">{emails}</p>
            <p className="text-xs text-muted-foreground mt-1">
              E-mails enviados à empresa de prospeccao
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Taxa de resposta:{" "}
              <span className="font-semibold" style={{ color: COLORS.ok }}>
                {taxaResposta}%
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4" style={{ borderLeftColor: COLORS.ok }}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.ok}15` }}
              >
                <Upload className="w-5 h-5" style={{ color: COLORS.ok }} />
              </div>
              <Badge className="bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-0 text-[10px]">
                Anexos
              </Badge>
            </div>
            <p className="text-3xl font-bold text-foreground">{anexos}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Vezes que a empresa de prospeccao anexou documentos
            </p>
            <p className="text-[10px] text-muted-foreground mt-2">
              Último envio: <span className="font-semibold text-foreground">{ultimoAnexo}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* === Ações do Relatório === */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Relatório de Registro e Cobrança
          </span>
          <Badge variant="outline" className="text-[10px]">A4 · IA</Badge>
          {wasGenerated && (
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{
                color: isStale ? COLORS.incompleto : COLORS.ok,
                borderColor: isStale ? COLORS.incompleto : COLORS.ok,
              }}
            >
              {isStale ? "Desatualizado" : "Atualizado"} ·{" "}
              {generatedAt ? new Date(generatedAt).toLocaleString("pt-BR") : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {wasGenerated && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePrint}
                className="rounded-lg gap-2"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                className="rounded-lg gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                Salvar
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEmailOpen(true)}
            className="rounded-lg gap-2"
          >
            <Mail className="w-3.5 h-3.5" />
            Enviar por e-mail
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
            className={`rounded-lg gap-2 text-white ${
              !wasGenerated
                ? "bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]"
                : isStale
                  ? "bg-[hsl(38,92%,50%)] hover:bg-[hsl(38,92%,45%)] animate-pulse ring-2 ring-[hsl(38,92%,50%)]/40"
                  : "bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]"
            }`}
          >
            {generating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Gerando…
              </>
            ) : !wasGenerated ? (
              <>
                <FilePlus2 className="w-3.5 h-3.5" />
                Gerar Relatório
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar Relatório
              </>
            )}
          </Button>
        </div>
      </div>

      <CobrancaEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        prospeccaoId={prospeccao.id}
        companyName={prospeccao.empresa}
        onSent={fetchCobrancas}
      />

      {!wasGenerated && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center bg-muted/20">
          <FilePlus2 className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground mb-1">
            Relatório ainda não gerado
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Clique em <strong>Gerar Relatório</strong> para que a IA monte o
            documento de Registro e Cobrança com base nos dados atualmente
            carregados das pastas.
          </p>
        </div>
      )}

      {wasGenerated && isStale && (
        <div
          className="rounded-lg border-l-4 p-3 flex items-center gap-2 animate-pulse"
          style={{
            borderLeftColor: COLORS.incompleto,
            backgroundColor: `${COLORS.incompleto}10`,
          }}
        >
          <AlertTriangle className="w-4 h-4" style={{ color: COLORS.incompleto }} />
          <p className="text-xs text-foreground">
            Novos dados foram carregados desde a última geração. Clique em{" "}
            <strong>Atualizar Relatório</strong> para incorporar as alterações.
          </p>
        </div>
      )}

      {/* === RELATÓRIO ESTILO A4 === */}
      {wasGenerated && (
      <div ref={reportRef} className="bg-[hsl(220,15%,92%)] p-10 rounded-lg overflow-x-auto space-y-10">

        {/* === CAPA (padrão BEx — espelho do PDF Kanitz) === */}
        <div
          className="relative flex flex-col p-12 mx-auto bg-white shadow-xl border border-border page-break"
          style={{ width: "210mm", minHeight: "297mm", color: COLORS.navy }}
        >
          {/* Logo no topo direito */}
          <div className="flex justify-end">
            <img
              src={logoBrasilExpert}
              alt="Brasil Expert"
              className="h-16 w-auto object-contain"
            />
          </div>

          {/* "BRASIL EXPERT" centralizado abaixo do logo */}
          <div className="text-center mt-12">
            <h1 className="text-[26px] font-bold tracking-[0.18em]" style={{ color: COLORS.navy }}>
              BRASIL EXPERT
            </h1>
          </div>

          {/* Título central */}
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <h2 className="text-[26px] font-bold leading-tight uppercase max-w-[600px]" style={{ color: COLORS.navy }}>
              Relatório de Registro &amp; Cobrança
            </h2>
            <p className="text-base italic text-muted-foreground mt-3">
              Controle Documental — Prospeccao Inteligente BEx
            </p>

            {/* Badge de status (estilo "Zona de Atenção — FI: 0.00") */}
            <div
              className="inline-flex items-center gap-2 mt-8 px-6 py-2.5 rounded-full border"
              style={{
                borderColor: `${scoreSafe >= 67 ? COLORS.ok : scoreSafe >= 33 ? COLORS.incompleto : COLORS.vazio}40`,
                backgroundColor: `${scoreSafe >= 67 ? COLORS.ok : scoreSafe >= 33 ? COLORS.incompleto : COLORS.vazio}10`,
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: scoreSafe >= 67 ? COLORS.ok : scoreSafe >= 33 ? COLORS.incompleto : COLORS.vazio }}
              />
              <span className="text-sm font-semibold" style={{ color: COLORS.navy }}>
                {scoreSafe >= 67 ? "Documentação Adequada" : scoreSafe >= 33 ? "Atenção Documental" : "Documentação Crítica"} — Score {scoreSafe}%
              </span>
            </div>

            {/* Bloco RECUPERANDA / Prospeccao / EMISSÃO */}
            <div className="grid grid-cols-3 gap-8 mt-12 max-w-[600px] w-full">
              <div className="text-center">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Empresa de Prospeccao</p>
                <p className="text-sm font-semibold leading-tight" style={{ color: COLORS.navy }}>{prospeccao.empresa}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Prospeccao AJ</p>
                <p className="text-sm font-semibold leading-tight" style={{ color: COLORS.navy }}>{prospeccao.id}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Emissão</p>
                <p className="text-sm font-semibold leading-tight" style={{ color: COLORS.navy }}>{dataRelatorio}</p>
              </div>
            </div>

            <div className="w-full max-w-[600px] h-px bg-border mt-10" />

            {/* Responsável Técnico */}
            <div className="mt-6 text-center">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                Responsável Técnico
              </p>
              <p className="text-sm font-semibold" style={{ color: COLORS.navy }}>
                Auditor Contábil Sênior IA
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Plataforma BEx — Brasil Expert
              </p>
            </div>
          </div>

          {/* Linha azul + rodapé com endereço */}
          <div className="h-0.5 w-full mt-6 mb-2" style={{ backgroundColor: COLORS.blue, opacity: 0.6 }} />
          <div className="text-center text-[8px] text-muted-foreground border-t border-border pt-2 leading-relaxed">
            <p>Rua Cel. Oscar Porto, nº 736, 3º Andar, Paraíso, São Paulo-SP, CEP: 04003-003</p>
            <p>(11) 3285-4472 · https://www.brasilexpert.com.br/</p>
          </div>
        </div>

        {/* SUMÁRIO removido conforme solicitação */}

        {/* === PÁGINA 2 — DIAGNÓSTICO === */}
        <div className="p-12 mx-auto bg-white shadow-xl border border-border page-break" style={{ width: "210mm", minHeight: "297mm" }}>
            {/* Header da página */}
            <div className="flex items-center justify-between border-b-2 pb-3 mb-6" style={{ borderColor: COLORS.blue }}>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Brasil Expert · BEx-Prospeccao
                </p>
                <h2 className="text-xl font-bold" style={{ color: COLORS.navy }}>
                  Diagnóstico da IA
                </h2>
              </div>
              <img src={logoBrasilExpert} alt="" className="h-10 object-contain" />
            </div>

            {/* Sumário executivo */}
            <div className="mb-6 p-5 rounded-lg border" style={{ backgroundColor: `${COLORS.blue}08`, borderColor: `${COLORS.blue}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" style={{ color: COLORS.blue }} />
                <h3 className="font-bold text-sm" style={{ color: COLORS.navy }}>
                  Sumário Executivo
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                A análise técnica realizada pela IA da <strong>Brasil Expert</strong> sobre as pastas do
                OneDrive da recuperanda <strong>{prospeccao.empresa}</strong> identificou <strong>{total} tópicos</strong> documentais.
                Destes, <strong style={{ color: COLORS.ok }}>{completos.length} estão completos</strong>,{" "}
                <strong style={{ color: COLORS.incompleto }}>{parciais.length} parcialmente documentados</strong> e{" "}
                <strong style={{ color: COLORS.vazio }}>{vazios.length} peprospeccaonecem vazios</strong>.
                O <strong>score global de recebimento</strong> é de{" "}
                <strong style={{ color: scoreSafe >= 67 ? COLORS.ok : scoreSafe >= 33 ? COLORS.incompleto : COLORS.vazio }}>
                  {scoreSafe}%
                </strong>, exigindo controles ativos de cobrança.
              </p>
            </div>

            {/* Indicadores de Documentação, Score Global e Controles de Registro/Cobrança removidos conforme solicitação */}

            {/* Recomendação IA */}
            <div className="p-4 rounded-lg border-l-4" style={{ borderLeftColor: COLORS.incompleto, backgroundColor: `${COLORS.incompleto}08` }}>
              <p className="text-xs font-bold mb-1" style={{ color: COLORS.navy }}>
                💡 Recomendação da IA
              </p>
              <p className="text-xs text-foreground/80 leading-relaxed">
                {vazios.length > 0
                  ? `Priorize cobrança ativa das ${vazios.length} pasta(s) sem qualquer documento. Recomenda-se enviar e-mail foprospeccaol e registrar nova cobrança nas próximas 48h.`
                  : `Todas as pastas possuem ao menos um documento. Foque em complementar as ${parciais.length} pasta(s) parciais para liberar a auditoria.`}
              </p>
            </div>
          </div>

        {/* === PÁGINA 3 — PENDÊNCIAS DETALHADAS === */}
        <div className="p-12 mx-auto bg-white shadow-xl border border-border" style={{ width: "210mm", minHeight: "297mm" }}>
            <div className="flex items-center justify-between border-b-2 pb-3 mb-6" style={{ borderColor: COLORS.blue }}>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Brasil Expert · BEx-Prospeccao
                </p>
                <h2 className="text-xl font-bold" style={{ color: COLORS.navy }}>
                  Pendências e Documentos Pendentes
                </h2>
              </div>
              <img src={logoBrasilExpert} alt="" className="h-10 object-contain" />
            </div>

            {/* Pastas Vazias */}
            {vazios.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <FolderX className="w-4 h-4" style={{ color: COLORS.vazio }} />
                  <h3 className="text-sm font-bold" style={{ color: COLORS.vazio }}>
                    Pastas Vazias ({vazios.length})
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {vazios.map((t: any) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 p-2 rounded border"
                      style={{ borderColor: `${COLORS.vazio}30`, backgroundColor: `${COLORS.vazio}05` }}
                    >
                      <Badge className="bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,60%)] border-0 text-[9px] shrink-0">
                        #{t.pasta ?? "—"}
                      </Badge>
                      <span className="text-[11px] text-foreground truncate">{t.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parciais */}
            {parciais.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen className="w-4 h-4" style={{ color: COLORS.incompleto }} />
                  <h3 className="text-sm font-bold" style={{ color: COLORS.incompleto }}>
                    Tópicos Parcialmente Documentados ({parciais.length})
                  </h3>
                </div>
                <div className="space-y-1.5">
                  {parciais.map((t: any) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-2 rounded border"
                      style={{ borderColor: `${COLORS.incompleto}30`, backgroundColor: `${COLORS.incompleto}05` }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge className="bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,50%)] border-0 text-[9px] shrink-0">
                          #{t.pasta ?? "—"}
                        </Badge>
                        <span className="text-[11px] text-foreground truncate">{t.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${t.completude}%`,
                              backgroundColor: COLORS.incompleto,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono w-9 text-right" style={{ color: COLORS.incompleto }}>
                          {t.completude}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completos resumidos */}
            {completos.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4" style={{ color: COLORS.ok }} />
                  <h3 className="text-sm font-bold" style={{ color: COLORS.ok }}>
                    Tópicos Completos ({completos.length})
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {completos.slice(0, 24).map((t: any) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-1.5 p-1.5 rounded border text-[10px]"
                      style={{ borderColor: `${COLORS.ok}30`, backgroundColor: `${COLORS.ok}05` }}
                    >
                      <Badge className="bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,36%)] border-0 text-[8px] shrink-0">
                        #{t.pasta ?? "—"}
                      </Badge>
                      <span className="text-foreground truncate">{t.name}</span>
                    </div>
                  ))}
                </div>
                {completos.length > 24 && (
                  <p className="text-[10px] text-muted-foreground mt-2 text-center italic">
                    + {completos.length - 24} tópico(s) completo(s) não exibidos
                  </p>
                )}
              </div>
            )}

            {/* Conclusão */}
            <div
              className="mt-8 p-5 rounded-lg border-2"
              style={{ borderColor: COLORS.navy, backgroundColor: `${COLORS.navy}05` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4" style={{ color: COLORS.navy }} />
                <h3 className="text-sm font-bold" style={{ color: COLORS.navy }}>
                  Conclusão da Análise IA
                </h3>
              </div>
              <p className="text-xs text-foreground/85 leading-relaxed mb-3">
                Foram efetuadas <strong>{cobrancas} cobranças</strong> e enviados{" "}
                <strong>{emails} e-mails</strong> à recuperanda <strong>{prospeccao.empresa}</strong>,
                resultando em <strong>{anexos} anexos</strong> recebidos via OneDrive.
                A taxa de resposta atual é de <strong style={{ color: COLORS.ok }}>{taxaResposta}%</strong>,
                e o score global de recebimento documental encontra-se em{" "}
                <strong style={{ color: scoreSafe >= 67 ? COLORS.ok : scoreSafe >= 33 ? COLORS.incompleto : COLORS.vazio }}>
                  {scoreSafe}%
                </strong>.
              </p>
              <p className="text-xs text-foreground/85 leading-relaxed">
                {vazios.length === 0 && parciais.length === 0
                  ? "✓ Documentação completa. Recuperanda apta a prosseguir nas próximas etapas da auditoria."
                  : `⚠ ${vazios.length + parciais.length} tópico(s) ainda exigem complementação. Recomenda-se manutenção do ciclo ativo de cobrança.`}
              </p>
            </div>

            {/* Rodapé do relatório */}
            <div className="mt-12 pt-4 border-t text-center">
              <p className="text-[10px] text-muted-foreground">
                Documento gerado automaticamente pela IA · BEx-Prospeccao · Brasil Expert
              </p>
              <p className="text-[10px] text-muted-foreground">
                {dataRelatorio} · {prospeccao.id} · {prospeccao.empresa}
              </p>
            </div>
          </div>
      </div>
      )}
    </div>

  );
};

export default ProspeccaoAnaliseTab;
