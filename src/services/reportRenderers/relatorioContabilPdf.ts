// Renderer PDF — Relatório Contábil de Dados (layout enxuto, mesmas seções do DOCX).
import jsPDF from "jspdf";
import {
  type ReportDataset, type ReportPeriodBlock,
  fmtBRL, fmtPct, fmtRatio, fmtDate,
} from "@/services/relatorioContabilService";

const NAVY: [number, number, number] = [15, 41, 66];
const BLUE: [number, number, number] = [25, 118, 210];
const GRAY: [number, number, number] = [102, 102, 102];

interface Cursor { y: number }

function drawHeader(doc: jsPDF, c: Cursor): void {
  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("BEX AUDITORIA", 14, c.y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BLUE);
  doc.text("IA de Prospecção", 14, c.y + 5);
  doc.setDrawColor(220);
  doc.line(14, c.y + 8, 196, c.y + 8);
  c.y += 14;
}

function ensure(doc: jsPDF, c: Cursor, h: number): void {
  if (c.y + h > 280) {
    doc.addPage();
    c.y = 14;
    drawHeader(doc, c);
  }
}

function sectionTitle(doc: jsPDF, c: Cursor, text: string): void {
  ensure(doc, c, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(text, 14, c.y);
  c.y += 6;
}

function table(doc: jsPDF, c: Cursor, headers: string[], rows: string[][], widths: number[]): void {
  const rowH = 7;
  ensure(doc, c, rowH * (rows.length + 1) + 4);
  // header
  let x = 14;
  doc.setFillColor(...BLUE);
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  headers.forEach((h, i) => {
    doc.rect(x, c.y, widths[i], rowH, "F");
    doc.text(h, x + 2, c.y + 4.8);
    x += widths[i];
  });
  c.y += rowH;
  // rows
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30);
  rows.forEach((r, ri) => {
    ensure(doc, c, rowH);
    x = 14;
    if (ri % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      r.forEach((_, i) => { doc.rect(x, c.y, widths[i], rowH, "F"); x += widths[i]; });
      x = 14;
    }
    doc.setDrawColor(220);
    r.forEach((cellText, i) => {
      doc.rect(x, c.y, widths[i], rowH);
      const isNum = i > 0;
      const tx = isNum ? x + widths[i] - 2 : x + 2;
      doc.text(String(cellText), tx, c.y + 4.8, isNum ? { align: "right" } : undefined);
      x += widths[i];
    });
    c.y += rowH;
  });
  c.y += 3;
}

function drawPeriodBlock(doc: jsPDF, c: Cursor, p: ReportPeriodBlock, blocks: ReportDataset["blocks"]): void {
  ensure(doc, c, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(`Período: ${p.label}`, 14, c.y);
  c.y += 8;

  const AT = p.snapshot.ativo_circulante + p.snapshot.ativo_nao_circulante;
  const PT = p.snapshot.passivo_circulante + p.snapshot.passivo_nao_circulante;
  const pct = (v: number) => AT ? `${((v / AT) * 100).toFixed(2)}%` : "—";

  if (blocks.balanco) {
    sectionTitle(doc, c, "Resumo Patrimonial");
    table(doc, c,
      ["Item", "Valor (R$)", "% do AT"],
      [
        ["Ativo Total", fmtBRL(AT), "100.00%"],
        ["Ativo Circulante", fmtBRL(p.snapshot.ativo_circulante), pct(p.snapshot.ativo_circulante)],
        ["Ativo Não Circulante", fmtBRL(p.snapshot.ativo_nao_circulante), pct(p.snapshot.ativo_nao_circulante)],
        ["Passivo Total", fmtBRL(PT), pct(PT)],
        ["Passivo Circulante", fmtBRL(p.snapshot.passivo_circulante), pct(p.snapshot.passivo_circulante)],
        ["Passivo Não Circulante", fmtBRL(p.snapshot.passivo_nao_circulante), pct(p.snapshot.passivo_nao_circulante)],
        ["Patrimônio Líquido", fmtBRL(p.snapshot.patrimonio_liquido), pct(p.snapshot.patrimonio_liquido)],
      ],
      [80, 60, 42]);
  }

  if (blocks.endividamento) {
    sectionTitle(doc, c, "Composição Detalhada do Endividamento");
    table(doc, c,
      ["Composição", "Valor (R$)", "% do PT"],
      [
        ["Dívida Financeira", fmtBRL(p.snapshot.divida_financeira), PT ? `${((p.snapshot.divida_financeira / PT) * 100).toFixed(2)}%` : "—"],
        ["Fornecedores", fmtBRL(p.snapshot.fornecedores), PT ? `${((p.snapshot.fornecedores / PT) * 100).toFixed(2)}%` : "—"],
        ["Dívida Tributária", fmtBRL(p.snapshot.divida_tributaria), PT ? `${((p.snapshot.divida_tributaria / PT) * 100).toFixed(2)}%` : "—"],
        ["Dívida Trabalhista", fmtBRL(p.snapshot.divida_trabalhista), PT ? `${((p.snapshot.divida_trabalhista / PT) * 100).toFixed(2)}%` : "—"],
        ["Credores RJ", fmtBRL(p.snapshot.credores_rj), PT ? `${((p.snapshot.credores_rj / PT) * 100).toFixed(2)}%` : "—"],
        ["Total da Dívida", fmtBRL(p.snapshot.divida_total), PT ? `${((p.snapshot.divida_total / PT) * 100).toFixed(2)}%` : "—"],
      ],
      [80, 60, 42]);
  }

  if (blocks.dre && p.dre.receita_liquida) {
    sectionTitle(doc, c, "DRE do Período");
    const rec = p.dre.receita_liquida;
    const pctR = (v: number) => rec ? `${((v / rec) * 100).toFixed(2)}%` : "—";
    table(doc, c, ["Conta DRE", "Valor (R$)", "% Rec. Líq."], [
      ["Receita Líquida", fmtBRL(rec), "100.00%"],
      ["CMV", fmtBRL(p.dre.cmv), pctR(p.dre.cmv)],
      ["Despesas Operacionais", fmtBRL(p.dre.despesas), pctR(p.dre.despesas)],
      ["Resultado do Período", fmtBRL(p.dre.resultado), pctR(p.dre.resultado)],
    ], [80, 60, 42]);
  }

  sectionTitle(doc, c, "Indicadores Calculados");
  const i = p.indicators;
  table(doc, c, ["Indicador", "Fórmula", "Resultado"], [
    ["Liquidez Corrente", "AC ÷ PC", fmtRatio(i.liquidez_corrente)],
    ["Liquidez Seca", "(AC − Est) ÷ PC", fmtRatio(i.liquidez_seca)],
    ["Liquidez Imediata", "Disp ÷ PC", fmtRatio(i.liquidez_imediata)],
    ["Liquidez Geral", "(AC+ANC) ÷ (PC+PNC)", fmtRatio(i.liquidez_geral)],
    ["Endividamento Total", "PT ÷ AT", fmtPct(i.endividamento_total)],
    ["Endividamento Curto Prazo", "PC ÷ AT", fmtPct(i.endividamento_cp)],
    ["Endividamento Longo Prazo", "PNC ÷ AT", fmtPct(i.endividamento_lp)],
    ["Composição do Endividamento", "PC ÷ PT", fmtPct(i.composicao_endividamento)],
    ["Capital de Terceiros", "PT ÷ (PT+PL)", fmtPct(i.capital_terceiros)],
    ["Imobilização do PL", "(AT−AC) ÷ PL", fmtPct(i.imobilizacao_pl)],
  ], [80, 60, 42]);

  if (blocks.kanitz && p.kanitz) {
    sectionTitle(doc, c, "Modelo de Insolvência (Kanitz)");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text(`Fator de Insolvência: ${p.kanitz.fi.toFixed(3)} — ${p.kanitz.classificacao.toUpperCase()}`, 14, c.y);
    c.y += 8;
  }
  if (blocks.scoreRJ && p.scoreRJ) {
    sectionTitle(doc, c, "Score BEx-RJ");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text(`Score: ${p.scoreRJ.score}/100 — ${p.scoreRJ.classificacao}`, 14, c.y);
    c.y += 8;
  }
}

export function generateRelatorioContabilPdf(d: ReportDataset, filename?: string): void {
  if (!d.periodos.length) throw new Error("Sem dados no intervalo selecionado.");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c: Cursor = { y: 14 };
  drawHeader(doc, c);

  // Capa
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text("Relatório Contábil de Dados", 14, c.y);
  c.y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BLUE);
  doc.text("Composição, Endividamento e Balanço", 14, c.y);
  c.y += 8;

  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text(`Empresa: ${d.empresaNome}${d.empresaCnpj ? ` — CNPJ ${d.empresaCnpj}` : ""}`, 14, c.y); c.y += 5;
  if (d.prospeccaoId) { doc.setTextColor(...GRAY); doc.text(`Prospeccao: ${d.prospeccaoId}`, 14, c.y); c.y += 5; }
  doc.setTextColor(40);
  const ini = d.periodos[0].label;
  const fim = d.periodos[d.periodos.length - 1].label;
  doc.text(`Período: ${ini} a ${fim} (${d.periodos.length} ${d.periodos.length === 1 ? "período" : "períodos"})`, 14, c.y); c.y += 5;
  doc.setTextColor(...GRAY);
  doc.text(`Emitido em ${fmtDate(d.emittedAt)}`, 14, c.y); c.y += 8;

  // Sumário comparativo
  sectionTitle(doc, c, "Sumário Comparativo");
  table(doc, c,
    ["Período", "AT", "PT", "PL", "Endiv. %", "LC"],
    d.periodos.map(p => {
      const AT = p.snapshot.ativo_circulante + p.snapshot.ativo_nao_circulante;
      const PT = p.snapshot.passivo_circulante + p.snapshot.passivo_nao_circulante;
      return [
        p.label,
        fmtBRL(AT), fmtBRL(PT), fmtBRL(p.snapshot.patrimonio_liquido),
        fmtPct(p.indicators.endividamento_total),
        fmtRatio(p.indicators.liquidez_corrente),
      ];
    }),
    [50, 32, 32, 32, 24, 14]);

  for (const p of d.periodos) {
    doc.addPage();
    c.y = 14;
    drawHeader(doc, c);
    drawPeriodBlock(doc, c, p, d.blocks);
  }

  doc.save(filename || `Relatorio_Contabil_${d.empresaNome.replace(/\s+/g, "_")}_${ini}_${fim}.pdf`);
}
