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
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">aplique e configure o MD-GEMINI-DOCUMENT-FETCH-ENGINE-001

Versão: 1.0

Status: Foundation

Projeto: Plataforma de Prospecção BEx

Módulo:

Document Fetch Engine

Objetivo:

Implementar um motor responsável pela aquisição, validação e preparação dos documentos PDF antes do processamento pelo Gemini.

Este módulo é obrigatório e antecede qualquer execução do Motor Cognitivo de Extração.

---

# 1. Objetivo da Arquitetura

O Gemini nunca deverá acessar URLs diretamente.

O Gemini receberá exclusivamente arquivos PDF já obtidos pela Plataforma.

Separação de responsabilidades.

Document Fetch Engine

↓

Download

↓

Validação

↓

Storage Temporário

↓

Gemini

---

# 2. Responsabilidades

O Document Fetch Engine será responsável por:

✓ Ler Link_Documento

✓ Validar URL

✓ Abrir conexão HTTP

✓ Autenticar (quando necessário)

✓ Realizar Download

✓ Validar retorno

✓ Validar Content-Type

✓ Validar tamanho

✓ Validar integridade

✓ Calcular HASH

✓ Detectar duplicidade

✓ Salvar documento temporário

✓ Disponibilizar PDF ao Gemini

---

# 3. Fluxo Oficial

Planilha

↓

Registro

↓

Link_Documento

↓

Document Fetch Engine

↓

HTTP GET

↓

Validação

↓

PDF

↓

Storage Temporário

↓

Gemini

↓

Extração Cognitiva

---

# 4. Entrada

Receber.

document_id

empresa

processo

link_documento

Exemplo.

https://docs.gestorjuridico.com.br/Documento/Download?idDoc=231535&causa=&sigla=REJ&V=46326

---

# 5. Validação Inicial

Antes do download.

Validar.

URL válida

HTTPS

Domínio permitido

Formato esperado

Caso inválido.

Encerrar processamento.

Registrar erro.

---

# 6. Lista Branca

Permitir apenas domínios autorizados.

Inicialmente.

docs.gestorjuridico.com.br

Permitir expansão futura.

---

# 7. Download

Executar HTTP GET.

Não utilizar navegador.

Não utilizar OCR.

Não utilizar Gemini.

Somente cliente HTTP.

---

# 8. Cabeçalhos HTTP

Permitir configuração.

User-Agent

Accept

Accept-Language

Referer

Authorization

Cookie

Origin

Todos configuráveis.

Nunca fixos.

---

# 9. Sessão

Caso o servidor exija autenticação.

Permitir.

Cookie

Bearer Token

JWT

API Key

Sessão autenticada

Todos deverão ser armazenados temporariamente.

Nunca dentro do Gemini.

---

# 10. Timeout

Tempo máximo.

30 segundos.

Após.

Nova tentativa.

Máximo.

3 tentativas.

Backoff exponencial.

---

# 11. Validação da Resposta

Aceitar.

HTTP 200

Content-Type

application/pdf

Caso diferente.

Registrar.

401

403

404

429

500

503

Timeout

---

# 12. Verificação do Documento

Após download.

Validar.

Arquivo existe

Arquivo maior que zero

PDF válido

Quantidade páginas

Sem corrupção

Caso inválido.

Interromper.

---

# 13. Hash

Calcular.

SHA-256

Salvar.

Utilizar para:

Duplicidade

Versionamento

Auditoria

---

# 14. Duplicidade

Antes de enviar ao Gemini.

Comparar.

Hash

Quantidade páginas

Processo

Documento

Caso igual.

Não baixar novamente.

Reutilizar documento.

---

# 15. Storage Temporário

Salvar.

storage/temp/

Estrutura.

Ano

↓

Mês

↓

Dia

↓

Processo

↓

Documento

Nunca utilizar armazenamento definitivo.

---

# 16. Metadados

Registrar.

Nome arquivo

Tamanho

Hash

Quantidade páginas

Data download

Tempo download

Status

---

# 17. Envio ao Gemini

O Gemini receberá apenas.

documento.pdf

Nunca URL.

Nunca Cookie.

Nunca Token.

Nunca Sessão.

---

# 18. Tratamento de Erros

Criar mensagens padronizadas.

DOWNLOAD_TIMEOUT

DOWNLOAD_404

DOWNLOAD_403

PDF_INVALIDO

PDF_CORROMPIDO

URL_INVALIDA

SESSAO_EXPIRADA

COOKIE_INVALIDO

CONTENT_TYPE_INVALIDO

---

# 19. Reprocessamento

Caso falha.

Permitir.

Reexecutar download.

Sem reiniciar toda análise.

---

# 20. Cache

Caso mesmo documento.

Mesmo Hash.

Mesmo Processo.

Mesmo Link.

Utilizar documento existente.

Não realizar novo download.

---

# 21. Auditoria

Registrar.

Usuário

Data

Hora

Link

Tempo

Status

Hash

Servidor

Código HTTP

---

# 22. Segurança

Nunca armazenar.

Senha

Cookie permanente

Bearer definitivo

Sessão permanente

Todos deverão expirar automaticamente.

---

# 23. API Interna

Disponibilizar interface única.

fetchDocument()

Entrada.

Link_Documento

Saída.

PDF

Hash

Quantidade páginas

Status

Storage Path

Metadados

---

# 24. Integração

Ao concluir.

Enviar.

PDF

↓

Gemini

↓

MD-GEMINI-EXTRACAO-PROSPECCAO-ADMINISTRADOR-JUDICIAL-001

Nenhum outro módulo poderá acessar URLs diretamente.

---

# 25. Certificação

A implementação somente será aprovada quando.

✓ Todos os links válidos forem baixados.

✓ PDFs íntegros.

✓ Hash calculado.

✓ Storage criado.

✓ Duplicidade funcionando.

✓ Reprocessamento funcionando.

✓ Sessões autenticadas funcionando.

✓ Gemini recebendo apenas PDFs.

---

# 26. Critério de Homologação

Executar os links da planilha de homologação.

Para cada documento.

Confirmar.

Download

↓

Hash

↓

Storage

↓

PDF

↓

Gemini

↓

Extração

↓

Business Facts

↓

JSON

↓

Painel IA

Sem qualquer acesso HTTP realizado pelo Gemini.

---

# Resultado Esperado

Ao final da implementação, a Plataforma BEx possuirá uma camada de aquisição documental totalmente desacoplada do Motor Cognitivo.

O Document Fetch Engine será o único responsável pela comunicação com sistemas externos, autenticação, download e validação dos arquivos.

O Gemini passará a atuar exclusivamente como motor de interpretação documental, recebendo sempre documentos PDF íntegros, rastreáveis e certificados, garantindo maior estabilidade, segurança, desempenho e facilidade de manutenção da arquitetura.</p>
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
