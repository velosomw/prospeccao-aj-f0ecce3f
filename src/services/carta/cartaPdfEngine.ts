// MD-BEX-PDF-LETTER-PREVIEW-ENGINE-001 — Motor Editorial de Cartas (PDF Engine).
// Renderização determinística: Template + Dados -> PDF. Nunca HTML -> PDF.
// O mesmo Blob é utilizado para Preview (nova aba), Exportar PDF e Imprimir.
import jsPDF from "jspdf";
import letterheadAsset from "@/assets/carta-bex-letterhead.png.asset.json";
import carlitoRegular from "@/assets/carlito-regular.ttf.asset.json";
import carlitoBold from "@/assets/carlito-bold.ttf.asset.json";
import {
  LETTER_LAYOUT, LETTER_ASSINATURA, MODELO_PARABENIZANDO,
  dataPorExtenso, fillPlaceholders, type LetterData, type Paragraph,
} from "./letterTemplate";

const PT_TO_MM = 25.4 / 72;

/* ---------------------------------------------------------------- recursos */

const bufCache = new Map<string, Promise<ArrayBuffer>>();
function fetchBuf(url: string): Promise<ArrayBuffer> {
  let p = bufCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar recurso editorial: ${url}`);
      return r.arrayBuffer();
    });
    bufCache.set(url, p);
  }
  return p;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function loadFonts(doc: jsPDF): Promise<void> {
  const [reg, bold] = await Promise.all([
    fetchBuf(carlitoRegular.url).then(toBase64),
    fetchBuf(carlitoBold.url).then(toBase64),
  ]);
  doc.addFileToVFS("Carlito-Regular.ttf", reg);
  doc.addFont("Carlito-Regular.ttf", "Carlito", "noprospecçãol");
  doc.addFileToVFS("Carlito-Bold.ttf", bold);
  doc.addFont("Carlito-Bold.ttf", "Carlito", "bold");
}

/* ------------------------------------------------------------- tipografia */

interface Ctx {
  doc: jsPDF;
  y: number;
  bg: string;
}

const L = LETTER_LAYOUT;
const CONTENT_W = L.page.width - L.margin.left - L.margin.right;
const LINE_MM = L.body.sizePt * PT_TO_MM * L.body.lineHeight;
const BOTTOM_LIMIT = L.page.height - L.margin.bottom;

function newPage(ctx: Ctx, first = false): void {
  if (!first) ctx.doc.addPage();
  ctx.doc.addImage(ctx.bg, "PNG", 0, 0, L.page.width, L.page.height, undefined, "FAST");
  // Início do texto abaixo do timbre gráfico do template (área útil real).
  ctx.y = Math.max(L.margin.top, 48);

  ctx.doc.setFont("Carlito", "noprospecçãol");
  ctx.doc.setFontSize(L.body.sizePt);
  ctx.doc.setTextColor(L.body.color);
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y + needed > BOTTOM_LIMIT) newPage(ctx);
}

/** Segmenta o texto mantendo "Brasil Expert" em negrito. */
interface Token { text: string; bold: boolean; w: number }

function tokenize(doc: jsPDF, text: string): Token[] {
  const out: Token[] = [];
  const re = /Brasil Expert/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (chunk: string, bold: boolean) => {
    for (const word of chunk.split(/\s+/)) {
      if (!word) continue;
      doc.setFont("Carlito", bold ? "bold" : "noprospecçãol");
      out.push({ text: word, bold, w: doc.getTextWidth(word) });
    }
  };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index), false);
    push(m[0], true);
    last = m.index + m[0].length;
  }
  push(text.slice(last), false);
  return out;
}

/** Parágrafo justificado, sem hifenização, com recuo de primeira linha. */
function drawParagraph(ctx: Ctx, text: string, indent: boolean): void {
  const { doc } = ctx;
  doc.setFontSize(L.body.sizePt);
  const tokens = tokenize(doc, text);
  doc.setFont("Carlito", "noprospecçãol");
  const spaceW = doc.getTextWidth(" ");

  const lines: { tokens: Token[]; offset: number; width: number }[] = [];
  let line: Token[] = [];
  let lineW = 0;
  let offset = indent ? L.body.firstLineIndentMm : 0;
  const avail = () => CONTENT_W - offset;

  for (const t of tokens) {
    const add = line.length ? spaceW + t.w : t.w;
    if (line.length && lineW + add > avail()) {
      lines.push({ tokens: line, offset, width: avail() });
      line = [t];
      lineW = t.w;
      offset = 0;
    } else {
      line.push(t);
      lineW += add;
    }
  }
  if (line.length) lines.push({ tokens: line, offset, width: avail() });

  lines.forEach((ln, i) => {
    ensure(ctx, LINE_MM);
    const isLast = i === lines.length - 1;
    const wordsW = ln.tokens.reduce((s, t) => s + t.w, 0);
    const gaps = ln.tokens.length - 1;
    const gap = !isLast && gaps > 0 ? (ln.width - wordsW) / gaps : spaceW;
    let x = L.margin.left + ln.offset;
    const baseline = ctx.y + L.body.sizePt * PT_TO_MM * 0.82;
    for (const t of ln.tokens) {
      doc.setFont("Carlito", t.bold ? "bold" : "noprospecçãol");
      doc.text(t.text, x, baseline);
      x += t.w + gap;
    }
    ctx.y += LINE_MM;
  });

  ctx.y += L.body.spaceAfterPt * PT_TO_MM; // espaçamento depois: 6 pt
}

function drawLine(ctx: Ctx, text: string, opts: { bold?: boolean; align?: "left" | "right" } = {}): void {
  const { doc } = ctx;
  ensure(ctx, LINE_MM);
  doc.setFont("Carlito", opts.bold ? "bold" : "noprospecçãol");
  doc.setFontSize(L.body.sizePt);
  doc.setTextColor(L.body.color);
  const baseline = ctx.y + L.body.sizePt * PT_TO_MM * 0.82;
  if (opts.align === "right") {
    doc.text(text, L.page.width - L.margin.right, baseline, { align: "right" });
  } else {
    doc.text(text, L.margin.left, baseline);
  }
  ctx.y += LINE_MM;
}

/* --------------------------------------------------------------- render */

export interface CartaTemplateId { modelo: "parabenizando" }

function bodyFor(_: CartaTemplateId): Paragraph[] {
  return MODELO_PARABENIZANDO;
}

async function render(data: LetterData, template: CartaTemplateId): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  await loadFonts(doc);
  const bg = `data:image/png;base64,${toBase64(await fetchBuf(letterheadAsset.url))}`;

  const ctx: Ctx = { doc, y: L.margin.top, bg };
  newPage(ctx, true);

  // 12. Data — canto superior direito, por extenso
  drawLine(ctx, data.data || dataPorExtenso(data.referenceDate ?? new Date()), { align: "right" });
  ctx.y += LINE_MM;

  // 13. Destinatário
  drawLine(ctx, `À ${data.cliente}`, { bold: true });
  if (data.administrador) drawLine(ctx, `A/C ${data.administrador} — Administrador Judicial`);
  if (data.contato) drawLine(ctx, data.contato);
  ctx.y += LINE_MM;

  // 14. Saudação
  drawLine(ctx, "Prezado(a),");
  ctx.y += LINE_MM * 0.5;

  // 15/16. Corpo justificado
  for (const p of bodyFor(template)) {
    drawParagraph(ctx, fillPlaceholders(p.text, data), p.indent !== false);
  }

  // 11/17/18. Bloco de assinatura indivisível
  const blockH = LINE_MM * 5;
  ensure(ctx, blockH);
  ctx.y += LINE_MM * 2;
  drawLine(ctx, "Atenciosamente,");
  ctx.y += LINE_MM;
  drawLine(ctx, LETTER_ASSINATURA.nome, { bold: true });
  drawLine(ctx, LETTER_ASSINATURA.empresa, { bold: true });

  doc.setProperties({
    title: `Carta BEx — ${data.cliente}`,
    subject: `Processo ${data.processo}`,
    author: "Brasil Expert",
    creator: "BEx Letter Engine",
  });
  const fixed = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  (doc as unknown as { setCreationDate?: (d: Date) => void }).setCreationDate?.(fixed);

  return doc.output("blob");
}

/* ---------------------------------------------------------------- cache */

interface CacheEntry { blob: Blob; url: string }
const cache = new Map<string, CacheEntry>();

function keyOf(data: LetterData, template: CartaTemplateId): string {
  return JSON.stringify({
    t: template.modelo,
    d: { ...data, referenceDate: data.referenceDate?.toISOString() },
  });
}

/**
 * Retorna o PDF definitivo (mesmo arquivo para preview, download e impressão).
 * Reutiliza o PDF em cache quando nenhum dado foi alterado.
 */
export async function getCartaPdf(
  data: LetterData,
  template: CartaTemplateId = { modelo: "parabenizando" },
): Promise<CacheEntry> {
  const key = keyOf(data, template);
  const hit = cache.get(key);
  if (hit) return hit;
  const blob = await render(data, template);
  const entry: CacheEntry = { blob, url: URL.createObjectURL(blob) };
  cache.set(key, entry);
  return entry;
}

export function cartaFileName(data: LetterData): string {
  const slug = data.cliente.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
  return `Carta_BEx_${slug || "Cliente"}.pdf`;
}

/** 3. Preview — abre o PDF definitivo em nova aba do navegador. */
export async function previewCarta(data: LetterData): Promise<void> {
  const { url } = await getCartaPdf(data);
  window.open(url, "_blank", "noopener");
}

/** 27. Download — utiliza exatamente o PDF do preview. */
export async function downloadCarta(data: LetterData): Promise<void> {
  const { url } = await getCartaPdf(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = cartaFileName(data);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Impressão — mesmo arquivo PDF, sem window.print() de HTML. */
export async function printCarta(data: LetterData): Promise<void> {
  const { url } = await getCartaPdf(data);
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };
  document.body.appendChild(frame);
}
