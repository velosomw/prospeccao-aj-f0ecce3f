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
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">aplique e configure o MD-DOCUMENT-FETCH-ENTERPRISE-ENGINE-001

Versão: 1.0

Status:

FOUNDATION

Categoria:

Enterprise Service

Projeto:

Orange AI Platform

Aplicação Inicial:

Plataforma Prospecção BEx

Serviço:

Enterprise Document Fetch Engine

---

# 1. Objetivo

Criar um serviço corporativo responsável pela aquisição, autenticação, download, validação, armazenamento temporário e disponibilização de documentos digitais para qualquer motor de Inteligência Artificial da Plataforma.

Este serviço deverá eliminar qualquer responsabilidade dos motores IA sobre:

• acesso HTTP;

• autenticação;

• download;

• cookies;

• tokens;

• sessões;

• validação documental.

Os motores IA trabalharão exclusivamente com documentos certificados.

---

# 2. Filosofia

Motores IA interpretam documentos.

Motores IA não fazem download.

Motores IA não autenticam.

Motores IA não acessam websites.

Motores IA nunca recebem URLs.

Recebem apenas documentos.

---

# 3. Arquitetura Corporativa

                Plataforma

                     │

                     ▼

      Enterprise Document Fetch Engine

                     │

      ┌──────────────┼──────────────┐

      ▼              ▼              ▼

  Gestor Jurídico   OneDrive     SharePoint

      ▼              ▼              ▼

          Documento Certificado

                     │

      ┌──────────────┼──────────────┐

      ▼              ▼              ▼

 Gemini          GPT           Outros Motores IA

---

# 4. Objetivos

O serviço deverá:

✓ acessar documentos externos;

✓ autenticar;

✓ controlar sessões;

✓ baixar arquivos;

✓ validar conteúdo;

✓ identificar formato;

✓ gerar HASH;

✓ armazenar temporariamente;

✓ detectar duplicidade;

✓ fornecer documento certificado.

---

# 5. Fontes Suportadas

Inicialmente.

Gestor Jurídico

OneDrive

SharePoint

Google Drive

Azure Blob

Supabase Storage

Amazon S3

Links Públicos HTTPS

A arquitetura deverá permitir inclusão de novos conectores.

---

# 6. Conceito de Conector

Cada origem possuirá um conector.

Exemplo.

ConnectorGestorJuridico

ConnectorOneDrive

ConnectorSharePoint

ConnectorGoogleDrive

Todos deverão implementar a mesma interface.

---

# 7. Interface Única

Todos os módulos deverão consumir apenas:

DocumentFetchService.fetch()

Entrada.

URL

↓

Saída.

Documento Certificado

---

# 8. Pipeline

Receber URL

↓

Selecionar Conector

↓

Autenticar

↓

Abrir Sessão

↓

Download

↓

Validação

↓

HASH

↓

Storage Temporário

↓

Documento Certificado

↓

Disponibilizar ao Motor IA

---

# 9. Conector Gestor Jurídico

Implementar.

HTTP GET

HTTPS

Headers configuráveis

Cookies

Bearer

JWT

Sessão autenticada

Renovação automática

---

# 10. Configuração

Todos os parâmetros deverão ser externos.

Domínio

Headers

Cookies

Timeout

Quantidade Tentativas

User-Agent

Não permitir valores fixos no código.

---

# 11. Sessões

Permitir.

Login

↓

Sessão

↓

Cookie

↓

Download

↓

Renovação

↓

Logout

Expiração automática.

---

# 12. Download

Executar somente após autenticação válida.

Aceitar.

HTTP 200

application/pdf

application/octet-stream

Caso contrário.

Registrar erro.

---

# 13. Tipos Aceitos

PDF

DOCX

XLSX

PPTX

CSV

TXT

ZIP

Imagem

Arquivos adicionais poderão ser registrados futuramente.

---

# 14. Certificação

Após download.

Validar.

Arquivo existente

Tamanho

Formato

Integridade

Quantidade páginas

Hash SHA-256

Sem corrupção

---

# 15. Storage Temporário

Criar estrutura.

temp/

ano/

mês/

dia/

origem/

processo/

arquivo

Todos os documentos deverão possuir tempo de expiração configurável.

---

# 16. Cache Inteligente

Caso.

Mesmo HASH

Mesmo Documento

Mesmo Processo

Mesmo Link

↓

Não baixar novamente.

Reutilizar documento certificado.

---

# 17. Metadados

Registrar.

Origem

URL

Nome

Hash

Tamanho

Tipo

Data Download

Tempo Download

Status

Conector

Versão

---

# 18. Tratamento de Erros

Padronizar.

DOWNLOAD_TIMEOUT

DOWNLOAD_FORBIDDEN

DOWNLOAD_NOT_FOUND

CONTENT_TYPE_INVALIDO

PDF_CORROMPIDO

COOKIE_EXPIRADO

TOKEN_INVALIDO

ERRO_AUTENTICACAO

ERRO_CONECTOR

---

# 19. Auditoria

Registrar.

Usuário

Data

Hora

Conector

Servidor

Tempo

Status

Hash

Código HTTP

---

# 20. Segurança

Nunca armazenar.

Senhas

Cookies permanentes

Bearer permanente

Sessões permanentes

Todos os tokens deverão possuir ciclo de vida controlado.

---

# 21. API Corporativa

Disponibilizar.

fetch()

validate()

authenticate()

renewSession()

invalidateSession()

getMetadata()

download()

Todos os motores IA utilizarão apenas esta API.

---

# 22. Integração com Motores IA

Fluxo.

DocumentFetchEngine

↓

Documento Certificado

↓

Gemini

↓

GPT

↓

Claude

↓

Outros

Nenhum motor IA poderá acessar sistemas externos diretamente.

---

# 23. Escalabilidade

Permitir.

Novos conectores

Novos formatos

Novos protocolos

Novos mecanismos de autenticação

Sem alteração nos motores IA.

---

# 24. Certificação

A implementação será considerada aprovada quando.

✓ Todos os conectores funcionarem.

✓ Downloads certificados.

✓ Sessões controladas.

✓ Cache funcionando.

✓ Duplicidade funcionando.

✓ Storage temporário funcionando.

✓ Auditoria completa.

✓ Motores IA recebendo apenas documentos.

---

# 25. Critério Final

A Plataforma Orange deverá possuir uma camada única de aquisição documental.

Todos os projetos corporativos utilizarão este serviço.

Os motores IA deixarão de conhecer URLs, autenticações, sessões e protocolos de download.

A arquitetura permanecerá desacoplada, reutilizável, escalável e preparada para integração com qualquer repositório documental futuro.

---

# Roadmap de Evolução

FASE 1

Gestor Jurídico

OneDrive

SharePoint

Google Drive

FASE 2

Microsoft Graph

Supabase Storage

Amazon S3

Azure Blob

FASE 3

WebDAV

FTP/SFTP

API REST

SOAP

Repositórios corporativos proprietários

---

# Resultado Esperado

Ao final da implementação, a Plataforma Orange passará a possuir um serviço corporativo de aquisição documental reutilizável por todos os projetos.

O Enterprise Document Fetch Engine será a única camada autorizada a acessar documentos externos, garantindo:

• desacoplamento entre IA e infraestrutura;

• reutilização entre projetos;

• rastreabilidade completa;

• segurança;

• governança;

• maior estabilidade operacional;

• facilidade de manutenção;

• escalabilidade para futuras integrações.</p>
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
