// MD-GEMINI-LIVE-PROCESSING-CERTIFICATION-001 — Certificação Operacional (LIVE CERTIFICATION)
import { useEffect, useState } from "react";
import PlatformLayout from "@/components/PlatformLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, PlayCircle, Loader2, CheckCircle2, AlertTriangle, Download,
  FileSpreadsheet, FileText, Braces, Lock,
} from "lucide-react";
import {
  runLiveCertification, listCertificationRuns, FASES_CERTIFICACAO,
  type CertRunResult, type FaseCertificacao, type CertProcesso,
} from "@/services/certificacaoLiveService";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import type { UserOptions } from "jspdf-autotable";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

interface jsPDFWithPlugin extends jsPDF { autoTable: (o: UserOptions) => jsPDF }

export default function CertificacaoLive() {
  const { toast } = useToast();
  const [fase, setFase] = useState<FaseCertificacao>(1);
  const [links, setLinks] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [result, setResult] = useState<CertRunResult | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [aberto, setAberto] = useState<number | null>(null);

  const refresh = () => listCertificationRuns().then(setRuns).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const aprovadas = new Set(runs.filter(r => r.status === "aprovado").map(r => r.fase));
  const faseLiberada = (f: number) => f === 1 || aprovadas.has(FASES_CERTIFICACAO[FASES_CERTIFICACAO.indexOf(f as FaseCertificacao) - 1]);

  const executar = async () => {
    setLoading(true); setErro(null); setResult(null);
    try {
      const list = links.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      const res = await runLiveCertification(fase, list);
      setResult(res);
      toast({
        title: res.status === "aprovado" ? `Fase ${fase} APROVADA` : `Fase ${fase} REPROVADA`,
        description: `${res.consolidado.processados} processo(s) executados com documentos reais.`,
        variant: res.status === "aprovado" ? "default" : "destructive",
      });
      refresh();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setErro(msg);
      toast({ title: "Falha na certificação", description: msg, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const baixar = (blob: Blob, nome: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome; a.click();
    URL.revokeObjectURL(url);
  };

  const exportarXlsx = () => {
    if (!result) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      Fase: result.fase, Status: result.status, ...result.consolidado,
    }]), "Consolidado");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.processos.map(p => ({
      Ordem: p.ordem, Processo: p.numero_processo, Empresa: p.empresa, Status: p.status,
      Document_ID: p.document_id, Download: p.download?.status, Hash: p.download?.hash_sha256,
      Paginas: p.download?.paginas, Modelo: p.gemini?.modelo, Tokens_Entrada: p.gemini?.tokens_entrada,
      Tokens_Saida: p.gemini?.tokens_saida, Business_Facts: p.business_facts?.length ?? 0,
      Score: p.painel?.score, Tempo_ms: p.tempo_total_ms, Motivo: p.motivo_reprovacao,
    }))), "Processos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.processos.flatMap(p =>
      (p.business_facts ?? []).map((b: any) => ({
        Processo: p.numero_processo, Canonical_Field: b.canonical_field ?? b.tipo, Entity_Type: b.entity_type,
        Valor: b.valor, Origem: b.origem, Pagina: b.pagina, Trecho: b.trecho,
        Business_Rule: b.business_rule, Confianca: b.confianca,
      })))), "Business Facts");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    baixar(new Blob([out]), "CERTIFICACAO_OPERACIONAL_GEMINI_BEX.xlsx");
  };

  const exportarLog = () => {
    if (!result) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(result.processos.flatMap(p =>
      (p.etapas ?? []).map((e: any) => ({
        Document_ID: p.document_id, Processo: p.numero_processo, Empresa: p.empresa,
        Etapa: e.etapa, Inicio: e.inicio, Fim: e.fim, Tempo_ms: e.tempo_ms,
        Tempo_Total_ms: p.tempo_total_ms, Status: p.status,
      })))), "Log");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    baixar(new Blob([out]), "LOG_CERTIFICACAO_GEMINI.xlsx");
  };

  const exportarJson = () => {
    if (!result) return;
    baixar(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }), "JSON_CERTIFICACAO.json");
  };

  const exportarPdf = () => {
    if (!result) return;
    const doc = new jsPDF() as jsPDFWithPlugin;
    doc.setFontSize(14);
    doc.text("CERTIFICAÇÃO OPERACIONAL — MOTOR GEMINI (BEx)", 14, 18);
    doc.setFontSize(10);
    doc.text(`Fase: ${result.fase} • Resultado: ${result.status.toUpperCase()} • ${new Date().toLocaleString("pt-BR")}`, 14, 25);
    doc.autoTable({
      startY: 32,
      head: [["Indicador", "Valor"]],
      body: Object.entries(result.consolidado).map(([k, v]) => [k, String(v)]),
    });
    doc.autoTable({
      head: [["#", "Processo", "Empresa", "Download", "OCR", "BF", "Score", "Status"]],
      body: result.processos.map(p => [
        p.ordem, p.numero_processo ?? "—", p.empresa ?? "—", p.download?.status ?? "—",
        p.gemini?.ocr ? "OK" : "—", p.business_facts?.length ?? 0, p.painel?.score ?? "—", p.status,
      ]),
    });
    doc.save("CERTIFICACAO_OPERACIONAL_GEMINI_BEX.pdf");
  };

  const exportarDocx = async () => {
    if (!result) return;
    const children: Paragraph[] = [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Certificação Operacional — Motor Gemini")] }),
      new Paragraph({ children: [new TextRun(`Fase ${result.fase} — Resultado: ${result.status.toUpperCase()}`)] }),
    ];
    result.processos.forEach(p => {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`${p.ordem}. ${p.numero_processo ?? "Processo não identificado"}`)] }));
      children.push(new Paragraph({ children: [new TextRun(`Empresa: ${p.empresa ?? "—"} | Document_ID: ${p.document_id ?? "—"} | Status: ${p.status}`)] }));
      children.push(new Paragraph({ children: [new TextRun(`Resumo Executivo: ${p.painel?.resumo_executivo ?? "—"}`)] }));
      children.push(new Paragraph({ children: [new TextRun(`Resumo Comercial: ${p.painel?.resumo_comercial?.status ?? "—"} — ${p.painel?.resumo_comercial?.justificativa ?? "—"}`)] }));
      children.push(new Paragraph({ children: [new TextRun(`Business Facts: ${p.business_facts?.length ?? 0} | Evidências: ${p.evidencias?.length ?? 0} | Tempo: ${p.tempo_total_ms} ms`)] }));
    });
    const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
    baixar(blob, "CERTIFICACAO_OPERACIONAL_GEMINI_BEX.docx");
  };

  const c = result?.consolidado;

  return (
    <PlatformLayout>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-[hsl(217,91%,50%)] mt-1" />
          <div>
            <h1 className="text-2xl font-bold">Certificação Operacional — LIVE CERTIFICATION</h1>
            <p className="text-sm text-muted-foreground max-w-3xl">
              MD-GEMINI-LIVE-PROCESSING-CERTIFICATION-001 — executa o pipeline completo (Aquisição Corporativa → Download →
              Hash → Gemini → OCR → Classificação → Segmentação → Business Facts → JSON Canônico → Workspace Temporário →
              Painel Inteligente) com documentos reais do Gestor Jurídico. Nenhuma alteração definitiva é feita na base.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ordem de Certificação (1 → 5 → 20 → 100)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {FASES_CERTIFICACAO.map(f => {
                const liberada = faseLiberada(f);
                const ok = aprovadas.has(f);
                return (
                  <button key={f} onClick={() => liberada && setFase(f)} disabled={!liberada}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition flex items-center gap-2
                      ${fase === f ? "bg-[hsl(217,91%,50%)] text-primary-foreground border-transparent" : "bg-background"}
                      ${!liberada ? "opacity-50 cursor-not-allowed" : ""}`}>
                    {!liberada && <Lock className="w-3.5 h-3.5" />}
                    {ok && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                    {f} processo{f > 1 ? "s" : ""}
                  </button>
                );
              })}
            </div>
            <Textarea rows={3} value={links} onChange={e => setLinks(e.target.value)}
              placeholder="Opcional: cole links reais do Gestor Jurídico (um por linha). Vazio = usa a planilha carregada, do primeiro processo em diante." />
            <div className="flex items-center gap-2">
              <Button onClick={executar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                {loading ? "Executando pipeline real..." : `Executar Fase ${fase}`}
              </Button>
              {result && (
                <>
                  <Button variant="outline" size="sm" onClick={exportarPdf}><FileText className="w-4 h-4 mr-1" /> PDF</Button>
                  <Button variant="outline" size="sm" onClick={exportarDocx}><Download className="w-4 h-4 mr-1" /> DOCX</Button>
                  <Button variant="outline" size="sm" onClick={exportarXlsx}><FileSpreadsheet className="w-4 h-4 mr-1" /> XLSX</Button>
                  <Button variant="outline" size="sm" onClick={exportarLog}><FileSpreadsheet className="w-4 h-4 mr-1" /> Log</Button>
                  <Button variant="outline" size="sm" onClick={exportarJson}><Braces className="w-4 h-4 mr-1" /> JSON</Button>
                </>
              )}
            </div>
            {erro && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5" /> <span>{erro}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Processos" value={c?.processados ?? 0} />
          <Kpi label="Downloads" value={c?.downloads ?? 0} />
          <Kpi label="OCR" value={c?.ocr ?? 0} />
          <Kpi label="Business Facts" value={c?.business_facts ?? 0} />
          <Kpi label="JSON válidos" value={c?.json_validos ?? 0} />
          <Kpi label="Painéis" value={c?.paineis ?? 0} />
          <Kpi label="Alertas" value={c?.alertas ?? 0} tone="orange" />
          <Kpi label="Falhas" value={c?.falhas ?? 0} tone="red" />
          <Kpi label="Sucesso" value={result ? Math.round(((c!.processados - c!.falhas) / Math.max(c!.processados, 1)) * 100) : 0} suffix="%" tone="green" />
          <Kpi label="Tempo médio" value={c ? Math.round(c.tempo_medio_ms / 1000) : 0} suffix="s" />
        </div>

        {result && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Relatórios Individuais — evidências operacionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.processos.map(p => (
                <div key={p.ordem} className="border rounded-lg">
                  <button onClick={() => setAberto(aberto === p.ordem ? null : p.ordem)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm">
                    {p.aprovado ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                    <span className="font-semibold">{p.numero_processo ?? "Processo não identificado"}</span>
                    <span className="text-muted-foreground truncate flex-1">{p.empresa ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{p.tempo_total_ms} ms</span>
                    <span className={`text-xs font-semibold ${p.aprovado ? "text-green-600" : "text-red-600"}`}>{p.status.toUpperCase()}</span>
                  </button>
                  {aberto === p.ordem && <DetalheProcesso p={p} />}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Histórico de certificações</CardTitle></CardHeader>
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma certificação executada ainda.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>{["Data", "Fase", "Status", "Aprovados", "Reprovados", "BF", "Tempo médio"].map(h =>
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2">{r.fase}</td>
                      <td className={`px-3 py-2 font-semibold ${r.status === "aprovado" ? "text-green-600" : "text-red-600"}`}>{r.status}</td>
                      <td className="px-3 py-2">{r.aprovados}</td>
                      <td className="px-3 py-2">{r.reprovados}</td>
                      <td className="px-3 py-2">{r.business_facts_total}</td>
                      <td className="px-3 py-2">{Math.round((r.tempo_medio_ms ?? 0) / 1000)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </PlatformLayout>
  );
}

function DetalheProcesso({ p }: { p: CertProcesso }) {
  return (
    <div className="px-4 pb-4 space-y-3 text-xs">
      <Bloco titulo="Download / Aquisição Corporativa" obj={p.download} />
      <Bloco titulo="Gemini" obj={p.gemini} />
      <div>
        <div className="font-semibold mb-1">Business Facts ({p.business_facts?.length ?? 0})</div>
        <div className="space-y-1">
          {(p.business_facts ?? []).map((b: any, i: number) => (
            <div key={i} className="bg-muted/40 rounded px-2 py-1">
              <b>{b.canonical_field ?? b.tipo}</b> — {b.valor} ({b.moeda ?? "BRL"}) • pág. {b.pagina ?? "—"} • confiança {b.confianca ?? "—"}
              {b.trecho && <div className="text-muted-foreground italic">“{b.trecho}”</div>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="font-semibold mb-1">Painel Inteligente</div>
        <p className="text-muted-foreground">{p.painel?.resumo_executivo ?? "—"}</p>
        <p className="mt-1">Score: <b>{p.painel?.score ?? "—"}</b> • Recomendação: {p.painel?.recomendacao ?? "—"}</p>
      </div>
      <div>
        <div className="font-semibold mb-1">Checklist de Aprovação</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
          {Object.entries(p.checklist ?? {}).map(([k, v]) => (
            <div key={k} className={v ? "text-green-600" : "text-red-600"}>{v ? "✓" : "✗"} {k.replace(/_/g, " ")}</div>
          ))}
        </div>
        {p.motivo_reprovacao && <div className="mt-1 text-red-600">Motivo: {p.motivo_reprovacao}</div>}
      </div>
    </div>
  );
}

function Bloco({ titulo, obj }: { titulo: string; obj: Record<string, any> }) {
  return (
    <div>
      <div className="font-semibold mb-1">{titulo}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-muted-foreground">
        {Object.entries(obj ?? {}).map(([k, v]) => (
          <div key={k} className="truncate">{k.replace(/_/g, " ")}: <span className="text-foreground">{String(v)}</span></div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, suffix = "", tone = "blue" }: { label: string; value: number; suffix?: string; tone?: string }) {
  const colors: Record<string, string> = {
    blue: "text-[hsl(217,91%,50%)]", orange: "text-orange-600", green: "text-green-600", red: "text-red-600",
  };
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-2xl font-bold ${colors[tone]}`}>{value}{suffix}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
