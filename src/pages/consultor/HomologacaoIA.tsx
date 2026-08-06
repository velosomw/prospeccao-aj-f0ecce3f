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
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">aplique e configure o MD-ENTERPRISE-KNOWLEDGE-REGISTRY-001

Versão: 1.0

Status:

FOUNDATION CORPORATIVO

Projeto:

Orange AI Platform

Categoria:

Enterprise Knowledge Layer

Aplicações:

• Plataforma Prospecção BEx

• Plataforma RMA

• Plataforma Kanitz

• Auditoria Digital

• Demais Plataformas Orange

---

# 1. Objetivo

Criar uma camada corporativa responsável por transformar informações extraídas pelos motores de Inteligência Artificial em conhecimento reutilizável.

Esta camada representa a memória corporativa da Plataforma.

Enquanto o Document Registry armazena documentos e o Business Facts armazena fatos, o Knowledge Registry armazena conhecimento consolidado.

---

# 2. Filosofia

Documentos não são conhecimento.

Business Facts também não.

Conhecimento surge da consolidação, relacionamento, evolução temporal e reutilização dos Business Facts produzidos.

A plataforma deverá aprender continuamente.

---

# 3. Arquitetura

Document Registry

↓

Gemini

↓

Business Facts

↓

JSON Canônico

↓

Enterprise Knowledge Registry

↓

Dashboards

↓

Pesquisa

↓

Assistentes IA

↓

Motores Analíticos

---

# 4. Objetivos

O Knowledge Registry deverá:

✓ consolidar conhecimento

✓ eliminar duplicidades

✓ relacionar entidades

✓ manter histórico

✓ permitir consultas inteligentes

✓ alimentar dashboards

✓ suportar futuras IAs

✓ preservar rastreabilidade

---

# 5. Objetos de Conhecimento

Registrar.

Empresas

Administradores Judiciais

Magistrados

Advogados

Credores

Recuperandas

Grupos Econômicos

Processos

Comarcas

Varas

Tribunais

Eventos Processuais

Indicadores Comerciais

Documentos

---

# 6. Modelo de Relacionamento

Empresa

↓

Participa

↓

Processo

↓

Possui

↓

Administrador Judicial

↓

Possui

↓

Magistrado

↓

Possui

↓

Business Facts

↓

Origem Documental

Toda informação deverá possuir relacionamento.

---

# 7. Registro de Empresas

Para cada empresa registrar.

Razão Social

Razões Anteriores

Nome Fantasia

CNPJ

Estado

Cidade

Segmento

Grupo Econômico

Situação

Quantidade de Processos

Última Atualização

Histórico

---

# 8. Registro de Pessoas

Para cada pessoa.

Nome

Tipo

Administrador Judicial

Magistrado

Advogado

Representante

Empresa

Quantidade Processos

Histórico

Documentos

---

# 9. Registro de Processos

Número CNJ

Classe

Tipo

Situação

Fase

Empresa

Valor

AJ

Magistrado

Data Distribuição

Último Evento

Histórico

---

# 10. Registro de Eventos

Cada processo possuirá histórico.

Distribuição

Petição

Despacho

Processamento

Nomeação AJ

Plano

Assembleia

Sentença

Encerramento

Todos cronológicos.

---

# 11. Registro Comercial

Criar indicadores.

Prioridade

Complexidade

Potencial Econômico

Probabilidade AJ

Interesse BEx

Situação Comercial

Histórico

---

# 12. Aprendizado Contínuo

Sempre que um processo for reprocessado.

Atualizar.

Conhecimento.

Nunca apagar histórico.

Criar nova versão.

---

# 13. Relacionamentos

Permitir consultas.

Empresa

↓

Todos Processos

↓

Todos Magistrados

↓

Todos AJ

↓

Todos Credores

↓

Todos Valores

↓

Histórico

---

# 14. Pesquisa Inteligente

Permitir localizar.

Empresa

Pessoa

AJ

Magistrado

Grupo Econômico

Valor

Documento

Business Fact

Evento

Cidade

Estado

Tribunal

---

# 15. Histórico Temporal

Registrar.

Primeira Aparição

Última Atualização

Quantidade Atualizações

Versões

Mudanças

Nunca perder histórico.

---

# 16. Conhecimento Compartilhado

O mesmo conhecimento poderá ser utilizado por.

Prospecção

↓

RMA

↓

Kanitz

↓

Auditoria

↓

Assistentes IA

↓

Dashboards

Nenhum módulo criará conhecimento isoladamente.

---

# 17. Integração IA

Os motores IA poderão consultar.

Empresa

↓

Knowledge Registry

↓

Histórico

↓

Relacionamentos

↓

Contexto

↓

Novo Processo

A IA deixará de analisar documentos isoladamente.

Passará a analisar conhecimento acumulado.

---

# 18. Indicadores

Calcular automaticamente.

Quantidade Empresas

Quantidade Processos

AJ

Magistrados

Grupos Econômicos

Empresas por Estado

Empresas por Tribunal

Histórico Comercial

Ranking AJ

Ranking Magistrados

---

# 19. API Corporativa

Disponibilizar.

getCompany()

getProcess()

getAJ()

getJudge()

getKnowledge()

searchKnowledge()

getTimeline()

getBusinessHistory()

Todos os módulos utilizarão esta API.

---

# 20. Governança

Todo conhecimento deverá possuir.

Origem

Business Facts

Documento

Hash

Data

Versão

Motor IA

Confiabilidade

Usuário

Rastreabilidade obrigatória.

---

# 21. Segurança

Nunca permitir.

Alteração manual do conhecimento consolidado.

Toda alteração deverá ocorrer por novo processamento certificado.

---

# 22. Certificação

A implementação será considerada aprovada quando.

✓ Empresas consolidadas.

✓ Pessoas relacionadas.

✓ Processos relacionados.

✓ Histórico funcionando.

✓ Pesquisa inteligente funcionando.

✓ Dashboards alimentados.

✓ APIs disponíveis.

✓ Histórico preservado.

---

# 23. Evolução

Este componente será a base para:

Assistentes Jurídicos

Copilotos

Pesquisa Semântica

Knowledge Graph

Business Intelligence

Analytics

Motores Preditivos

Sem necessidade de reprocessar documentos.

---

# 24. Resultado Esperado

Ao final da implementação, a Orange AI Platform deixará de ser uma plataforma que apenas interpreta documentos.

Passará a possuir uma Base Corporativa de Conhecimento Jurídico.

Essa base consolidará todo o aprendizado produzido pelos motores de IA, permitindo reutilização entre projetos, evolução contínua do conhecimento, consultas inteligentes, indicadores estratégicos e suporte à tomada de decisão.

O Enterprise Knowledge Registry será a memória institucional da plataforma, conectando documentos, Business Facts, entidades, eventos processuais e inteligência comercial em um único repositório governado, rastreável e reutilizável.</p>
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
