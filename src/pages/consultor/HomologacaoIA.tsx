import React, { useState } from "react";
import PlatformLayout from "@/components/PlatformLayout";
import { runHomologation, HomologationReport } from "@/services/prospeccaoHomologationService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, FileText, CheckCircle2, AlertTriangle, Loader2, Download, ScrollText, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { UserOptions } from "jspdf-autotable";

interface jsPDFWithPlugin extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
}

export default function HomologacaoIA() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<HomologationReport | null>(null);
  const [links, setLinks] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const { toast } = useToast();

  const handleRun = async () => {
    setLoading(true);
    setReport(null);
    setErro(null);
    try {
      const list = links.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      const res = await runHomologation(list.length ? list.length : 2, list);
      setReport(res);
      toast({ title: "Homologação Concluída", description: "O relatório foi gerado com sucesso." });
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      setErro(msg);
      toast({ title: "Erro na Homologação", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    if (!report) return;
    const doc = new jsPDF() as jsPDFWithPlugin;
    
    // Capa
    doc.setFontSize(22);
    doc.text("RELATORIO_HOMOLOGACAO_GEMINI_BEX", 105, 40, { align: "center" });
    doc.setFontSize(12);
    doc.text(`Motor Gemini | Versão: 1.0`, 105, 50, { align: "center" });
    doc.text(`Data: ${new Date().toLocaleDateString()} | Hora: ${new Date().toLocaleTimeString()}`, 105, 60, { align: "center" });
    doc.text(`Total Processos: ${report.total_processos} | Tempo Total: ${(report.tempo_total_ms / 1000).toFixed(1)}s`, 105, 70, { align: "center" });

    report.processos.forEach((p, i) => {
      doc.addPage();
      doc.setFontSize(16);
      doc.text(`Processo: ${p.processo}`, 20, 20);
      doc.setFontSize(10);
      doc.text(`Empresa: ${p.empresa}`, 20, 30);
      doc.text(`Status: ${p.status}`, 20, 35);
      
      doc.text("Resumo Executivo:", 20, 45);
      const splitResumo = doc.splitTextToSize(p.resumo_executivo || "N/A", 170);
      doc.text(splitResumo, 20, 50);

      doc.autoTable({
        startY: 70 + (splitResumo.length * 5),
        head: [['Campo', 'Valor Extraído (Gemini)', 'Resultado']],
        body: p.comparativo.map(c => [c.campo, c.valor_gemini || "N/A", "OK"]),
      });
    });

    doc.save("RELATORIO_HOMOLOGACAO_GEMINI_BEX.pdf");
  };

  return (
    <PlatformLayout>
      <div className="max-w-[1200px] mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center text-white">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Modo Homologação: Motor Gemini</h1>
              <p className="text-muted-foreground text-sm">Homologação do motor Gemini em modo não persistente.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRun} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              {loading ? "Processando..." : "Iniciar Homologação"}
            </Button>
            {report && (
              <Button onClick={generatePDF}>
                <Download className="w-4 h-4 mr-2" /> Gerar PDF
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Links de documentos (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <textarea
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={3}
              placeholder="Cole aqui um ou mais links de PDF (um por linha). Se deixar vazio, a homologação usa os links da planilha carregada."
              className="w-full text-xs font-mono rounded-md border border-border bg-background p-3 outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">
              Nenhum dado é gravado no banco durante a homologação.
            </p>
          </CardContent>
        </Card>

        {erro && (
          <Card className="border-red-200 bg-red-50/40">
            <CardContent className="py-4 flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{erro}</span>
            </CardContent>
          </Card>
        )}


        {loading && (
          <Card className="border-orange-200 bg-orange-50/30">
            <CardContent className="py-10 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
              <div className="text-center">
                <h3 className="font-semibold text-orange-900">Processando Pipeline Gemini</h3>
                <p className="text-sm text-orange-700 max-w-md">
                  Download PDF → OCR → Classificação → Extração Cognitiva → Business Facts.
                  <br />Nenhum dado será persistido em Banco de Dados.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {report && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-4 gap-4">
              <Kpi label="Total Processos" value={report.total_processos} tone="blue" />
              <Kpi label="OCR Executados" value={report.ocr_executados} tone="green" />
              <Kpi label="Tempo Total" value={`${(report.tempo_total_ms / 1000).toFixed(1)}s`} tone="orange" />
              <Kpi label="Status Geral" value="HOMOLOGADO" tone="green" />
            </div>

            <div className="space-y-4">
              {report.processos.map((p, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg font-bold">{p.processo}</CardTitle>
                      <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700 uppercase">
                        {p.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground font-semibold">{p.empresa}</p>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <ScrollText className="w-3.5 h-3.5" /> Resumo Executivo
                        </h4>
                        <p className="text-sm leading-relaxed text-foreground">{p.resumo_executivo}</p>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Oportunidade BEx
                        </h4>
                        <p className="text-sm leading-relaxed text-foreground">{p.oportunidade_bex}</p>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="text-xs font-bold uppercase mb-3">Checklist de Homologação</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(p.checklist).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-2 text-xs">
                            {val ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                            <span className="capitalize">{key.replace(/_/g, " ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </PlatformLayout>
  );
}

function Kpi({ label, value, tone }: { label: string; value: any; tone: string }) {
  const colors: any = {
    blue: "text-blue-600 border-blue-100 bg-blue-50/30",
    green: "text-green-600 border-green-100 bg-green-50/30",
    orange: "text-orange-600 border-orange-100 bg-orange-50/30",
  };
  return (
    <Card className={colors[tone]}>
      <CardContent className="p-4 pt-4">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      </CardContent>
    </Card>
  );
}
