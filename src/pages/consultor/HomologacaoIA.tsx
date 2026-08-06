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
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">aplique e configure o MD-ENTERPRISE-DOCUMENT-ACQUISITION-AND-REGISTRY-ENGINE-001

Versão: 1.0

Status: FOUNDATION CORPORATIVO

Projeto:

Orange AI Platform

Aplicações:

• Plataforma Prospecção BEx

• Plataforma RMA

• Plataforma Kanitz

• Auditoria Digital

• Futuras Plataformas Orange

Categoria

Enterprise Shared Service

---

# 1. Objetivo

Criar uma camada corporativa responsável por toda aquisição, autenticação, download, certificação, registro, versionamento e disponibilização de documentos para qualquer motor de Inteligência Artificial da Plataforma.

Nenhum motor IA deverá acessar diretamente:

- websites;

- APIs externas;

- links;

- cookies;

- tokens;

- sessões;

- autenticação.

Toda comunicação ocorrerá através deste serviço.

---

# 2. Filosofia

Os motores IA interpretam documentos.

A Plataforma obtém documentos.

O documento certificado torna-se patrimônio digital da Plataforma.

Todo documento baixado passa a existir independentemente da origem.

---

# 3. Arquitetura

                       Plataforma

                            │

                            ▼

Enterprise Document Acquisition

        and Registry Engine

        ┌───────────┼────────────┐

        ▼           ▼            ▼

 Gestor Jurídico  OneDrive   SharePoint

        ▼           ▼            ▼

      Download + Certificação

                 ▼

      Document Registry

                 ▼

      Storage Corporativo

                 ▼

Document ID Corporativo

                 ▼

Gemini

GPT

Claude

Motores IA

---

# 4. Responsabilidades

Este serviço será responsável por:

✓ aquisição documental

✓ autenticação

✓ gerenciamento de sessões

✓ download

✓ validação

✓ OCR opcional

✓ certificação

✓ geração HASH

✓ registro documental

✓ versionamento

✓ metadados

✓ auditoria

✓ disponibilização para IA

---

# 5. Fontes

Permitir integração com:

Gestor Jurídico

OneDrive

SharePoint

Google Drive

Azure Blob

Amazon S3

Supabase Storage

FTP

SFTP

API REST

Links HTTPS

WebDAV

Repositórios Proprietários

A arquitetura deverá permitir novos conectores sem alterar os motores IA.

---

# 6. Conceito de Conector

Cada origem possuirá um Connector.

Exemplo.

ConnectorGestorJuridico

ConnectorOneDrive

ConnectorSharePoint

ConnectorGoogleDrive

ConnectorSupabase

Todos implementando a mesma interface.

---

# 7. Pipeline Oficial

Receber URL

↓

Selecionar Connector

↓

Autenticar

↓

Abrir Sessão

↓

Download

↓

Validação

↓

Hash SHA-256

↓

Certificação

↓

Registro

↓

Storage

↓

Document ID

↓

Motores IA

---

# 8. Autenticação

Permitir.

Cookie

Bearer

JWT

OAuth

API Key

Sessão

Renovação automática

Expiração controlada

Nunca armazenar credenciais permanentes.

---

# 9. Download

Executar HTTP GET.

Validar.

Status HTTP

Content-Type

application/pdf

application/octet-stream

docx

xlsx

pptx

csv

txt

zip

imagem

Registrar falhas.

---

# 10. Certificação

Todo documento deverá ser certificado.

Validar.

Integridade

Hash

Formato

Quantidade páginas

OCR necessário

Idioma

Assinaturas digitais

Corrupção

Duplicidade

---

# 11. Registro Corporativo

Criar um registro permanente.

Document_ID

Origem

URL Original

Hash

Nome

Extensão

Tipo

Tamanho

Quantidade páginas

Idioma

Data Download

Versão

Status

Projeto

Empresa

Processo

Usuário

---

# 12. Document ID

Cada documento receberá um identificador único.

Exemplo.

DOC-20260805-0000001458

Este ID será utilizado por toda a Plataforma.

Nunca utilizar URL como referência.

---

# 13. Versionamento

Caso o mesmo documento seja atualizado.

Criar.

Versão 1

Versão 2

Versão 3

...

Preservar histórico completo.

---

# 14. Duplicidade

Comparar.

Hash

Nome

Quantidade páginas

Processo

Documento

Origem

Caso idêntico.

Não baixar novamente.

Reutilizar Document_ID existente.

---

# 15. Storage

Estrutura.

storage/

documentos/

ano/

mês/

origem/

empresa/

processo/

document_id/

Todas as IAs utilizarão apenas o Storage Corporativo.

---

# 16. Metadados

Registrar.

Origem

Conector

Servidor

Hash

Download

Tempo

Status

Tipo

OCR

Idioma

Versão

Último acesso

---

# 17. Auditoria

Registrar.

Quem baixou

Quando

Qual projeto

Qual IA utilizou

Tempo

Resultado

Hash

Versão

Document ID

---

# 18. API Corporativa

Disponibilizar.

authenticate()

download()

validate()

certify()

register()

getDocument()

getMetadata()

renewSession()

invalidateSession()

Todas as aplicações utilizarão esta API.

---

# 19. Integração IA

Nenhum motor IA poderá receber URL.

Fluxo.

Document_ID

↓

Storage

↓

Documento Certificado

↓

Gemini

↓

Business Facts

↓

JSON

↓

Painéis

---

# 20. Document Registry

Criar um Catálogo Corporativo.

Permitir localizar documentos por.

Document_ID

Empresa

Processo

Hash

Projeto

Origem

Data

Tipo

Usuário

Versão

---

# 21. Reutilização

Caso um documento já exista.

RMA

↓

BEx

↓

Kanitz

↓

Auditoria

Todos utilizarão o mesmo Document_ID.

Nenhum novo download será realizado.

---

# 22. Segurança

Nunca armazenar.

Cookies permanentes

Bearer permanente

Credenciais

Sessões permanentes

Todo acesso deverá ser auditável.

---

# 23. Performance

Download

30 segundos

Validação

5 segundos

Hash

2 segundos

Registro

1 segundo

Entrega ao Gemini

1 segundo

---

# 24. Critérios de Aprovação

A implementação será considerada aprovada quando.

✓ Todos os conectores funcionarem.

✓ Documentos certificados.

✓ Registro criado.

✓ Hash calculado.

✓ Versionamento funcionando.

✓ Cache funcionando.

✓ Reutilização funcionando.

✓ Auditoria completa.

✓ Motores IA recebendo exclusivamente Document_ID.

---

# 25. Roadmap

Fase 1

Gestor Jurídico

OneDrive

SharePoint

Google Drive

Supabase

Fase 2

Microsoft Graph

Amazon S3

Azure Blob

FTP

API REST

Fase 3

WebDAV

SOAP

Conectores Proprietários

---

# 26. Integração com o Motor Cognitivo

Após a certificação.

Document_ID

↓

PDF Certificado

↓

MD-GEMINI-EXTRACAO-PROSPECCAO-ADMINISTRADOR-JUDICIAL-001

↓

Business Facts

↓

JSON Canônico

↓

Painel Inteligente

↓

Dashboards

↓

Exportação

Nenhum componente posterior acessará URLs diretamente.

---

# 27. Resultado Esperado

Ao término da implementação, a Orange AI Platform possuirá uma camada corporativa única de aquisição e registro documental.

Essa camada será compartilhada por todos os projetos da empresa, garantindo:

• desacoplamento entre infraestrutura e IA;

• reutilização de documentos;

• eliminação de downloads redundantes;

• rastreabilidade completa;

• governança documental;

• segurança;

• versionamento;

• escalabilidade;

• redução do custo computacional;

• maior estabilidade operacional.

O Document Registry passará a ser o repositório oficial de documentos corporativos certificados, enquanto os motores de Inteligência Artificial atuarão exclusivamente sobre documentos previamente adquiridos, registrados e certificados pela plataforma.</p>
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
