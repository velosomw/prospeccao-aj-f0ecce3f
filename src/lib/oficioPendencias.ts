import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";

export interface PendenciaItem {
  numero: number;
  topico: string;
  descricao: string;
  severidade: "critica" | "alta" | "media" | "baixa";
  origem?: string;
}

export interface OficioMeta {
  prospeccaoCode: string;
  mesReferencia?: string;
  empresa?: string;
  responsavel?: string;
  emitidoPor?: string;
}

const SEV_LABEL: Record<PendenciaItem["severidade"], string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const SEV_FILL: Record<PendenciaItem["severidade"], string> = {
  critica: "FECACA",
  alta: "FEE2B5",
  media: "FEF3C7",
  baixa: "E0E7FF",
};

function todayBR() {
  return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function border() {
  return { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" };
}
function cellBorders() {
  const b = border();
  return { top: b, bottom: b, left: b, right: b };
}

export async function generateOficioDocx(pendencias: PendenciaItem[], meta: OficioMeta) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: ["#", "Tópico", "Descrição", "Severidade"].map((t, i) =>
      new TableCell({
        borders: cellBorders(),
        width: { size: [600, 2600, 5160, 1000][i], type: WidthType.DXA },
        shading: { fill: "0B3A82", type: ShadingType.CLEAR, color: "auto" },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: "FFFFFF", size: 20 })] })],
      })
    ),
  });

  const rows = pendencias.map((p) =>
    new TableRow({
      children: [
        new TableCell({
          borders: cellBorders(),
          width: { size: 600, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: String(p.numero), size: 20 })] })],
        }),
        new TableCell({
          borders: cellBorders(),
          width: { size: 2600, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: p.topico, bold: true, size: 20 })] })],
        }),
        new TableCell({
          borders: cellBorders(),
          width: { size: 5160, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: p.descricao, size: 20 })] })],
        }),
        new TableCell({
          borders: cellBorders(),
          width: { size: 1000, type: WidthType.DXA },
          shading: { fill: SEV_FILL[p.severidade], type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: SEV_LABEL[p.severidade], bold: true, size: 18 })] })],
        }),
      ],
    })
  );

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Noprospeccaol", next: "Noprospeccaol", quickFoprospeccaot: true,
          run: { size: 32, bold: true, font: "Arial", color: "0B3A82" },
          paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Noprospeccaol", next: "Noprospeccaol", quickFoprospeccaot: true,
          run: { size: 26, bold: true, font: "Arial", color: "0B3A82" },
          paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: todayBR(), size: 20, color: "64748B" })] }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Ofício de Pendências — Prospeccao")] }),
        new Paragraph({ children: [
          new TextRun({ text: "Prospeccao: ", bold: true }), new TextRun(meta.prospeccaoCode),
          new TextRun({ text: "    Mês de referência: ", bold: true }), new TextRun(meta.mesReferencia || "—"),
        ]}),
        ...(meta.empresa ? [new Paragraph({ children: [new TextRun({ text: "Recuperanda: ", bold: true }), new TextRun(meta.empresa)] })] : []),
        ...(meta.responsavel ? [new Paragraph({ children: [new TextRun({ text: "Responsável: ", bold: true }), new TextRun(meta.responsavel)] })] : []),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("1. Objeto")] }),
        new Paragraph({ children: [new TextRun(
          "O presente ofício foprospeccaoliza a relação de pendências, inconsistências e documentos faltantes identificados pelo Administrador Judicial durante a análise do Prospeccao em referência, nos termos da Recomendação CNJ 72/2020."
        )] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(`2. Pendências Identificadas (${pendencias.length})`)] }),
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [600, 2600, 5160, 1000],
          rows: [headerRow, ...rows],
        }),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3. Providências Solicitadas")] }),
        new Paragraph({ children: [new TextRun(
          "Solicita-se à Recuperanda o saneamento das pendências acima no prazo de 15 (quinze) dias corridos, mediante upload na plataforma BEx-Prospeccao e/ou resposta foprospeccaol por escrito. Pendências não sanadas serão consignadas no Relatório Mensal de Atividades (Prospeccao) submetido ao Juízo."
        )] }),
        new Paragraph({ children: [new TextRun("")] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meta.emitidoPor || "Administração Judicial — BEx-Prospeccao IA", bold: true })] }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Oficio_Pendencias_${meta.prospeccaoCode}.docx`);
}

export function generateOficioPdf(pendencias: PendenciaItem[], meta: OficioMeta) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 18;
  let y = margin;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9); pdf.setTextColor(100);
  pdf.text(todayBR(), pageW - margin, y, { align: "right" });

  y += 8;
  pdf.setFontSize(18); pdf.setTextColor(11, 58, 130); pdf.setFont("helvetica", "bold");
  pdf.text("Ofício de Pendências — Prospeccao", margin, y);

  y += 8;
  pdf.setFontSize(10); pdf.setTextColor(30); pdf.setFont("helvetica", "normal");
  pdf.text(`Prospeccao: ${meta.prospeccaoCode}    Mês de referência: ${meta.mesReferencia || "—"}`, margin, y);
  if (meta.empresa) { y += 5; pdf.text(`Recuperanda: ${meta.empresa}`, margin, y); }
  if (meta.responsavel) { y += 5; pdf.text(`Responsável: ${meta.responsavel}`, margin, y); }

  y += 10;
  pdf.setFont("helvetica", "bold"); pdf.setTextColor(11, 58, 130);
  pdf.text("1. Objeto", margin, y);
  y += 6;
  pdf.setFont("helvetica", "normal"); pdf.setTextColor(30); pdf.setFontSize(10);
  const objeto = pdf.splitTextToSize(
    "O presente ofício foprospeccaoliza a relação de pendências, inconsistências e documentos faltantes identificados pelo Administrador Judicial durante a análise do Prospeccao em referência, nos termos da Recomendação CNJ 72/2020.",
    pageW - margin * 2,
  );
  pdf.text(objeto, margin, y); y += objeto.length * 5 + 4;

  pdf.setFont("helvetica", "bold"); pdf.setTextColor(11, 58, 130); pdf.setFontSize(12);
  pdf.text(`2. Pendências Identificadas (${pendencias.length})`, margin, y);
  y += 6;

  // Tabela
  const cols = [
    { w: 10, label: "#" },
    { w: 45, label: "Tópico" },
    { w: 95, label: "Descrição" },
    { w: 24, label: "Severidade" },
  ];
  pdf.setFillColor(11, 58, 130); pdf.setTextColor(255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
  let x = margin;
  pdf.rect(margin, y, cols.reduce((a, c) => a + c.w, 0), 7, "F");
  cols.forEach(c => { pdf.text(c.label, x + 2, y + 5); x += c.w; });
  y += 7;

  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(30);
  pendencias.forEach((p) => {
    const topico = pdf.splitTextToSize(p.topico, cols[1].w - 3);
    const desc = pdf.splitTextToSize(p.descricao, cols[2].w - 3);
    const rowH = Math.max(topico.length, desc.length, 1) * 4 + 4;
    if (y + rowH > pageH - margin) { pdf.addPage(); y = margin; }
    const sevFill: Record<PendenciaItem["severidade"], [number, number, number]> = {
      critica: [254, 202, 202], alta: [254, 226, 181], media: [254, 243, 199], baixa: [224, 231, 255],
    };
    pdf.setDrawColor(203, 213, 225);
    x = margin;
    pdf.rect(x, y, cols[0].w, rowH); pdf.text(String(p.numero), x + 2, y + 5); x += cols[0].w;
    pdf.rect(x, y, cols[1].w, rowH); pdf.text(topico, x + 2, y + 5); x += cols[1].w;
    pdf.rect(x, y, cols[2].w, rowH); pdf.text(desc, x + 2, y + 5); x += cols[2].w;
    const [r, g, b] = sevFill[p.severidade]; pdf.setFillColor(r, g, b);
    pdf.rect(x, y, cols[3].w, rowH, "FD"); pdf.text(SEV_LABEL[p.severidade], x + 2, y + 5);
    y += rowH;
  });

  y += 6;
  if (y > pageH - 40) { pdf.addPage(); y = margin; }
  pdf.setFont("helvetica", "bold"); pdf.setTextColor(11, 58, 130); pdf.setFontSize(12);
  pdf.text("3. Providências Solicitadas", margin, y); y += 6;
  pdf.setFont("helvetica", "normal"); pdf.setTextColor(30); pdf.setFontSize(10);
  const prov = pdf.splitTextToSize(
    "Solicita-se à Recuperanda o saneamento das pendências acima no prazo de 15 (quinze) dias corridos, mediante upload na plataforma BEx-Prospeccao e/ou resposta foprospeccaol por escrito. Pendências não sanadas serão consignadas no Relatório Mensal de Atividades (Prospeccao) submetido ao Juízo.",
    pageW - margin * 2,
  );
  pdf.text(prov, margin, y); y += prov.length * 5 + 10;

  pdf.setFont("helvetica", "bold"); pdf.setTextColor(11, 58, 130);
  pdf.text(meta.emitidoPor || "Administração Judicial — BEx-Prospeccao IA", pageW / 2, y, { align: "center" });

  pdf.save(`Oficio_Pendencias_${meta.prospeccaoCode}.pdf`);
}

/** Deriva pendências a partir de dados de análise (topics + lista pendencias) */
export function buildPendenciasFromAnalysis(analysis: any): PendenciaItem[] {
  const out: PendenciaItem[] = [];
  let n = 1;

  // 1) Itens explícitos em analysis.pendencias
  const raw: any[] = Array.isArray(analysis?.pendencias) ? analysis.pendencias : [];
  raw.forEach((p) => {
    if (!p) return;
    const sev = String(p.severidade ?? p.severity ?? p.criticidade ?? "media").toLowerCase();
    const severidade: PendenciaItem["severidade"] =
      sev.startsWith("crit") ? "critica" :
      sev.startsWith("alt") ? "alta" :
      sev.startsWith("baix") ? "baixa" : "media";
    out.push({
      numero: n++,
      topico: String(p.topico ?? p.topic ?? p.area ?? "—"),
      descricao: String(p.descricao ?? p.description ?? p.mensagem ?? p.text ?? p.titulo ?? "—"),
      severidade,
      origem: p.origem ?? "Análise IA",
    });
  });

  // 2) Tópicos com status pendente/incompleto
  const topics: any[] = Array.isArray(analysis?.topics) ? analysis.topics : [];
  topics.forEach((t) => {
    const status = String(t?.status ?? "").toLowerCase();
    const compl = Number(t?.completude ?? 0);
    if (status === "completo" || compl >= 100) return;
    const severidade: PendenciaItem["severidade"] =
      compl === 0 ? "critica" : compl < 50 ? "alta" : compl < 80 ? "media" : "baixa";
    out.push({
      numero: n++,
      topico: t.name || t.title || `Tópico ${t.number ?? ""}`.trim(),
      descricao:
        compl === 0
          ? "Documento não enviado ou não identificado pela análise IA."
          : `Análise parcial (${compl}%) — informações incompletas ou divergentes.`,
      severidade,
      origem: "Tópico Prospeccao",
    });
  });

  return out;
}
