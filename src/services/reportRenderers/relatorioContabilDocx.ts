// Renderer DOCX — Relatório Contábil de Dados (fidelidade ao template BEX).
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  PageBreak, PageOrientation,
} from "docx";
import { saveAs } from "file-saver";
import {
  type ReportDataset, type ReportPeriodBlock,
  fmtBRL, fmtPct, fmtRatio, fmtDate,
} from "@/services/relatorioContabilService";

const NAVY = "0F2942";
const BLUE = "1976D2";
const cellBorder = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function head(text: string, color = "FFFFFF", fill = BLUE): TableCell {
  return new TableCell({
    width: { size: 3120, type: WidthType.DXA },
    borders,
    shading: { fill, type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color, size: 18 })] })],
  });
}
function cell(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; size?: number } = {}): TableCell {
  return new TableCell({
    width: { size: 3120, type: WidthType.DXA },
    borders,
    margins: { top: 70, bottom: 70, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 18 })],
    })],
  });
}
function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28, color: NAVY })],
  });
}
function h2(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color: NAVY })],
  });
}
function para(text: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 20, color: opts.color })],
  });
}

function comparativoTable(d: ReportDataset): Table {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [head("Período"), head("AT"), head("PT"), head("PL"), head("Endiv. %"), head("LC")],
    }),
  ];
  for (const p of d.periodos) {
    const AT = p.snapshot.ativo_circulante + p.snapshot.ativo_nao_circulante;
    const PT = p.snapshot.passivo_circulante + p.snapshot.passivo_nao_circulante;
    rows.push(new TableRow({
      children: [
        cell(p.label, { bold: true }),
        cell(fmtBRL(AT), { align: AlignmentType.RIGHT }),
        cell(fmtBRL(PT), { align: AlignmentType.RIGHT }),
        cell(fmtBRL(p.snapshot.patrimonio_liquido), { align: AlignmentType.RIGHT }),
        cell(fmtPct(p.indicators.endividamento_total), { align: AlignmentType.RIGHT }),
        cell(fmtRatio(p.indicators.liquidez_corrente), { align: AlignmentType.RIGHT }),
      ],
    }));
  }
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1860, 1700, 1700, 1700, 1200, 1200],
    rows,
  });
}

function resumoPatrimonialTable(p: ReportPeriodBlock): Table {
  const AT = p.snapshot.ativo_circulante + p.snapshot.ativo_nao_circulante;
  const PT = p.snapshot.passivo_circulante + p.snapshot.passivo_nao_circulante;
  const pct = (v: number) => (AT ? `${((v / AT) * 100).toFixed(2)}%` : "—");
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [head("Item"), head("Valor (R$)"), head("% do Ativo Total")],
    }),
    ...[
      ["Ativo Total", AT, 1],
      ["Ativo Circulante", p.snapshot.ativo_circulante, p.snapshot.ativo_circulante / Math.max(AT, 1)],
      ["Ativo Não Circulante", p.snapshot.ativo_nao_circulante, p.snapshot.ativo_nao_circulante / Math.max(AT, 1)],
      ["Passivo Total", PT, PT / Math.max(AT, 1)],
      ["Passivo Circulante", p.snapshot.passivo_circulante, p.snapshot.passivo_circulante / Math.max(AT, 1)],
      ["Passivo Não Circulante", p.snapshot.passivo_nao_circulante, p.snapshot.passivo_nao_circulante / Math.max(AT, 1)],
      ["Patrimônio Líquido", p.snapshot.patrimonio_liquido, p.snapshot.patrimonio_liquido / Math.max(AT, 1)],
    ].map(([label, valor, p2]) =>
      new TableRow({
        children: [
          cell(String(label), { bold: true }),
          cell(fmtBRL(valor as number), { align: AlignmentType.RIGHT }),
          cell(pct(valor as number), { align: AlignmentType.RIGHT }),
        ],
      })),
  ];
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [3360, 3000, 3000], rows });
}

function endividamentoTable(p: ReportPeriodBlock): Table {
  const PT = p.snapshot.passivo_circulante + p.snapshot.passivo_nao_circulante;
  const items: Array<[string, number]> = [
    ["Dívida Financeira", p.snapshot.divida_financeira],
    ["Fornecedores", p.snapshot.fornecedores],
    ["Dívida Tributária", p.snapshot.divida_tributaria],
    ["Dívida Trabalhista", p.snapshot.divida_trabalhista],
    ["Credores RJ", p.snapshot.credores_rj],
    ["Total da Dívida", p.snapshot.divida_total],
    ["Passivo Total (PT)", PT],
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3360, 3000, 3000],
    rows: [
      new TableRow({ tableHeader: true, children: [head("Composição"), head("Valor (R$)"), head("% do PT")] }),
      ...items.map(([label, val]) =>
        new TableRow({
          children: [
            cell(label, { bold: true }),
            cell(fmtBRL(val), { align: AlignmentType.RIGHT }),
            cell(PT ? `${((val / PT) * 100).toFixed(2)}%` : "—", { align: AlignmentType.RIGHT }),
          ],
        })),
    ],
  });
}

function dreTable(p: ReportPeriodBlock): Table {
  const rec = p.dre.receita_liquida;
  const rows: Array<[string, number]> = [
    ["Receita Líquida", rec],
    ["CMV", p.dre.cmv],
    ["Despesas Operacionais", p.dre.despesas],
    ["Resultado do Período", p.dre.resultado],
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3360, 3000, 3000],
    rows: [
      new TableRow({ tableHeader: true, children: [head("Conta DRE"), head("Valor (R$)"), head("% da Receita Líq.")] }),
      ...rows.map(([label, val]) =>
        new TableRow({
          children: [
            cell(label, { bold: true }),
            cell(fmtBRL(val), { align: AlignmentType.RIGHT }),
            cell(rec ? `${((val / rec) * 100).toFixed(2)}%` : "—", { align: AlignmentType.RIGHT }),
          ],
        })),
    ],
  });
}

function indicadoresTable(p: ReportPeriodBlock): Table {
  const i = p.indicators;
  const rows: Array<[string, string, string]> = [
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
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3760, 3000, 2600],
    rows: [
      new TableRow({ tableHeader: true, children: [head("Indicador"), head("Fórmula"), head("Resultado")] }),
      ...rows.map(([n, f, v]) =>
        new TableRow({
          children: [
            cell(n, { bold: true }),
            cell(f),
            cell(v, { align: AlignmentType.RIGHT, bold: true }),
          ],
        })),
    ],
  });
}

function buildBlock(p: ReportPeriodBlock, blocks: ReportDataset["blocks"]): Paragraph[] | (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(new Paragraph({ children: [new PageBreak()] }));
  out.push(h1(`Período: ${p.label}`));

  if (blocks.balanco) {
    out.push(h2("Resumo Patrimonial"));
    out.push(resumoPatrimonialTable(p));
  }
  if (blocks.endividamento) {
    out.push(h2("Composição Detalhada do Endividamento"));
    out.push(endividamentoTable(p));
  }
  if (blocks.dre && p.dre.receita_liquida) {
    out.push(h2("DRE do Período"));
    out.push(dreTable(p));
  }
  out.push(h2("Indicadores Calculados"));
  out.push(indicadoresTable(p));

  if (blocks.kanitz && p.kanitz) {
    out.push(h2("Modelo de Insolvência (Kanitz)"));
    out.push(para(`Fator de Insolvência: ${p.kanitz.fi.toFixed(3)} — ${p.kanitz.classificacao.toUpperCase()}`, { bold: true }));
  }
  if (blocks.scoreRJ && p.scoreRJ) {
    out.push(h2("Score BEx-RJ"));
    out.push(para(`Score: ${p.scoreRJ.score}/100 — ${p.scoreRJ.classificacao}`, { bold: true }));
  }
  return out as any;
}

export async function generateRelatorioContabilDocx(d: ReportDataset, filename?: string): Promise<void> {
  if (!d.periodos.length) throw new Error("Sem dados no intervalo selecionado.");

  const ini = d.periodos[0].label;
  const fim = d.periodos[d.periodos.length - 1].label;

  const cover: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BEX AUDITORIA", bold: true, size: 36, color: NAVY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Auditor Contábil Sênior IA", size: 22, color: BLUE })] }),
    new Paragraph({ spacing: { before: 240 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Relatório Contábil de Dados — Composição, Endividamento e Balanço", bold: true, size: 28, color: NAVY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Empresa: ${d.empresaNome}${d.empresaCnpj ? ` — CNPJ ${d.empresaCnpj}` : ""}`, size: 22 })] }),
    d.rmaId ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `RMA: ${d.rmaId}`, size: 20, color: "555555" })] }) : new Paragraph({}),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Período: ${ini} a ${fim} (${d.periodos.length} ${d.periodos.length === 1 ? "período" : "períodos"})`, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Emitido em ${fmtDate(d.emittedAt)}`, size: 20, color: "555555" })] }),
    new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: "Sumário Comparativo", bold: true, size: 26, color: NAVY })] }),
    comparativoTable(d),
  ];

  const children: (Paragraph | Table)[] = [...cover];
  for (const p of d.periodos) children.push(...(buildBlock(p, d.blocks) as any));

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children: children as any,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename || `Relatorio_Contabil_${d.empresaNome.replace(/\s+/g, "_")}_${ini}_${fim}.docx`);
}
