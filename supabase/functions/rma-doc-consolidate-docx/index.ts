// Gera/atualiza o Parecer Final em .docx a partir das seções do RMA Document.
// Aciona automaticamente quando >=90% das seções estão aprovadas/concluídas.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageOrientation, Footer, PageNumber, PageBreak, TabStopType, TabStopPosition,
  LevelFormat,
} from "https://esm.sh/docx@8.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "rma-documents";
// Limiares por tipo de documento (independentes)
const MIN_PCT_BY_TIPO: Record<string, number> = {
  parecer_tecnico: 100, // pericial: exige 100% das seções aprovadas
  rma_mensal: 70,       // acompanhamento: aceita parcial a partir de 70%
  rma_mensal_dip: 70,   // template DIP (Capital AJ)
  rma_intelligence: 70, // RMA Report Intelligence Engine (v3)
};
const MIN_PCT_DEFAULT = 90;

const TIPO_LABEL: Record<string, string> = {
  parecer_tecnico: "Parecer Técnico",
  rma_mensal: "Relatório Mensal de Atividades",
  rma_mensal_dip: "Relatório Mensal de Atividades – RMA",
  rma_intelligence: "Relatório Mensal de Atividades – RMA (Intelligence Engine)",
};

// Profundidade do `numero` define o nível do heading no DOCX (1, 1.1, 1.1.1).
function headingLevelFromNumero(numero: string | null): typeof HeadingLevel.HEADING_1 {
  if (!numero) return HeadingLevel.HEADING_2;
  const dots = (numero.match(/\./g) || []).length;
  if (dots === 0) return HeadingLevel.HEADING_1;
  if (dots === 1) return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
}

function plainParagraphs(text: string): Paragraph[] {
  const blocks = (text || "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) {
    return [new Paragraph({ children: [new TextRun({ text: "—", italics: true, color: "888888" })] })];
  }
  return blocks.map(
    (b) =>
      new Paragraph({
        spacing: { after: 160 },
        children: b.split(/\n/).map(
          (line, i) =>
            new TextRun({
              text: (i > 0 ? "  " : "") + line,
              break: i > 0 ? 1 : 0,
              size: 22,
            }),
        ),
      }),
  );
}

function buildDoc(opts: {
  titulo: string;
  tipo: string;
  pct: number;
  geradoEm: Date;
  versao: number;
  sections: Array<{
    numero: string | null;
    titulo: string;
    conteudo: string;
    status: string;
    dados_extraidos?: any;
    validacao?: any;
    analise_ia?: string | null;
    conclusao_ia?: any;
    risco?: string | null;
    risk_score?: number | null;
    evidence_count?: number;
  }>;
  capa?: {
    empresa?: string | null;
    cnpj?: string | null;
    juizo?: string | null;
    autos?: string | null;
    mes_referencia?: string | null;
    responsavel_tecnico?: string | null;
    administrador_judicial?: string | null;
  };
  executive_summary?: any;
  health_score?: number | null;
  risk_global?: string | null;
}) {
  const isDip = opts.tipo === "rma_mensal_dip" || opts.tipo === "rma_intelligence";
  const isIntelligence = opts.tipo === "rma_intelligence";
  const capa = opts.capa || {};

  // ===== CAPA (página dedicada) =====
  const coverParas: Paragraph[] = [];
  // Espaço superior
  coverParas.push(new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: "" })] }));
  coverParas.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new TextRun({ text: "CAPITAL ADMINISTRADORA JUDICIAL", bold: true, size: 28, color: "0F172A" })],
  }));
  coverParas.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 600 },
    children: [new TextRun({ text: "GRUPO CAPITAL", size: 20, color: "555555", italics: true })],
  }));

  coverParas.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
    children: [new TextRun({ text: TIPO_LABEL[opts.tipo] || "Documento RMA", bold: true, size: 40, color: "1E40AF" })],
  }));
  coverParas.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 400 },
    children: [new TextRun({ text: opts.titulo, size: 26 })],
  }));

  if (isDip || capa.juizo || capa.autos) {
    if (capa.juizo) {
      coverParas.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 120 },
        children: [new TextRun({ text: `AO ${capa.juizo}`.toUpperCase(), bold: true, size: 24 })],
      }));
    }
    if (capa.autos) {
      coverParas.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 120 },
        children: [new TextRun({ text: `AUTOS Nº ${capa.autos}`, bold: true, size: 22 })],
      }));
      coverParas.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 240 },
        children: [new TextRun({ text: "INCIDENTE DE RELATÓRIOS MENSAIS", bold: true, size: 22 })],
      }));
    }
    if (capa.empresa) {
      coverParas.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 120 },
        children: [new TextRun({ text: `Recuperanda: ${capa.empresa}${capa.cnpj ? ` — CNPJ ${capa.cnpj}` : ""}`, size: 22, bold: true })],
      }));
    }
    if (capa.mes_referencia) {
      coverParas.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 400 },
        children: [new TextRun({ text: `Mês de Referência: ${capa.mes_referencia}`, size: 22, bold: true, color: "1E40AF" })],
      }));
    }
    if (capa.administrador_judicial || capa.responsavel_tecnico) {
      coverParas.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { after: 120 },
        children: [new TextRun({
          text: `${capa.administrador_judicial || "Administrador Judicial"}${capa.responsavel_tecnico ? ` — Responsável Técnico: ${capa.responsavel_tecnico}` : ""}`,
          size: 20, italics: true, color: "555555",
        })],
      }));
    }
  }

  coverParas.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 600, after: 120 },
    children: [new TextRun({
      text: `Versão ${opts.versao} · ${opts.pct}% concluído · gerado em ${opts.geradoEm.toLocaleString("pt-BR")}`,
      size: 18, color: "888888", italics: true,
    })],
  }));
  // Page break depois da capa
  coverParas.push(new Paragraph({ children: [new PageBreak()] }));

  // ===== PETIÇÃO DE ABERTURA AO JUÍZO (Carta ao Juízo) =====
  if (isDip || capa.juizo || capa.autos) {
    const juizo = capa.juizo || "JUÍZO COMPETENTE";
    const autos = capa.autos || "—";
    const aj = capa.administrador_judicial || "CAPITAL ADMINISTRADORA JUDICIAL";
    const resp = capa.responsavel_tecnico || "Responsável Técnico";
    const mes = capa.mes_referencia || opts.titulo;
    const cidade = capa.cidade || "Cascavel";
    const data = opts.geradoEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    coverParas.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
      children: [new TextRun({ text: `AO ${juizo}`.toUpperCase(), bold: true, size: 24 })] }));
    coverParas.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
      children: [new TextRun({ text: `AUTOS Nº ${autos}`, bold: true, size: 22 })] }));
    coverParas.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 },
      children: [new TextRun({ text: "INCIDENTE DE RELATÓRIOS MENSAIS", bold: true, size: 22 })] }));
    coverParas.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 240 },
      children: [
        new TextRun({ text: `${aj.toUpperCase()}`, bold: true }),
        new TextRun({ text: `, na qualidade de Administradora Judicial devidamente nomeada e compromissada nos autos da Recuperação Judicial${capa.empresa ? ` de ${capa.empresa}` : ""}, em trâmite perante esse Juízo, por seu Responsável Técnico, ${resp}, vem, respeitosamente, apresentar ` }),
        new TextRun({ text: "RELATÓRIO MENSAL DE ATIVIDADES – RMA", bold: true }),
        new TextRun({ text: `, referente ao mês de ${mes.toUpperCase()}, nos termos do art. 22, II, alínea "c" da Lei nº 11.101/2005, e alinhado às diretrizes da Recomendação nº 72/2020 do Conselho Nacional de Justiça.` }),
      ] }));
    coverParas.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 480 },
      children: [new TextRun({ text: "Termos em que, pede deferimento." })] }));
    coverParas.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 480 },
      children: [new TextRun({ text: `${cidade}, ${data}.`, italics: true })] }));
    coverParas.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
      children: [new TextRun({ text: "_______________________________________" })] }));
    coverParas.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
      children: [new TextRun({ text: aj, bold: true })] }));
    coverParas.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
      children: [new TextRun({ text: resp, italics: true })] }));
    coverParas.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // ===== SUMÁRIO =====
  const tocParas: Paragraph[] = [];
  tocParas.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new TextRun({ text: "SUMÁRIO", bold: true, size: 32, color: "0F172A" })],
  }));
  // Lista de seções
  const tocTabStops = [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }];
  for (const s of opts.sections) {
    const numero = s.numero ? `${s.numero} ` : "";
    const dots = s.numero ? (s.numero.match(/\./g) || []).length : 0;
    const indent = dots * 360; // 360 DXA por nível
    const isTop = dots === 0;
    tocParas.push(new Paragraph({
      spacing: { after: 60 },
      indent: { left: indent },
      tabStops: tocTabStops,
      children: [
        new TextRun({ text: `${numero}${s.titulo}`, bold: isTop, size: isTop ? 22 : 20, color: isTop ? "0F172A" : "334155" }),
        new TextRun({ text: "\t—", size: 18, color: "888888" }),
      ],
    }));
  }
  tocParas.push(new Paragraph({ children: [new PageBreak()] }));

  // ===== CABEÇALHO compacto do corpo =====
  const headerParas: Paragraph[] = [];
  headerParas.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: TIPO_LABEL[opts.tipo] || "Documento RMA", bold: true, size: 24, color: "1E40AF" })],
  }));
  headerParas.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 320 },
    children: [new TextRun({
      text: `${opts.titulo}${capa.mes_referencia ? ` — ${capa.mes_referencia}` : ""}`,
      size: 18, color: "555555", italics: true,
    })],
  }));


  const sectionParas: Paragraph[] = [];

  // Executive Summary (apenas intelligence)
  if (isIntelligence && (opts.executive_summary || opts.health_score != null || opts.risk_global)) {
    sectionParas.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 320, after: 200 },
      children: [new TextRun({ text: "Sumário Executivo IA", bold: true, size: 28 })],
    }));
    if (opts.health_score != null || opts.risk_global) {
      sectionParas.push(new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: "Health Score: ", bold: true, size: 22 }),
          new TextRun({ text: `${opts.health_score ?? "—"} / 100`, size: 22 }),
          new TextRun({ text: "    Risco Global: ", bold: true, size: 22 }),
          new TextRun({ text: String(opts.risk_global ?? "—").toUpperCase(), size: 22 }),
        ],
      }));
    }
    const sum = opts.executive_summary || {};
    if (typeof sum?.resumo === "string" && sum.resumo.trim()) {
      sectionParas.push(...plainParagraphs(sum.resumo));
    }
    if (Array.isArray(sum?.alertas) && sum.alertas.length) {
      sectionParas.push(new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [new TextRun({ text: "Principais alertas:", bold: true, size: 22 })],
      }));
      for (const a of sum.alertas.slice(0, 10)) {
        sectionParas.push(new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: `• ${String(a)}`, size: 22 })],
        }));
      }
    }
  }

  for (const s of opts.sections) {
    const numero = s.numero ? `${s.numero} ` : "";
    const lvl = headingLevelFromNumero(s.numero);
    const size = lvl === HeadingLevel.HEADING_1 ? 28 : lvl === HeadingLevel.HEADING_2 ? 24 : 22;
    sectionParas.push(
      new Paragraph({
        heading: lvl,
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: `${numero}${s.titulo}`, bold: true, size })],
      }),
    );
    if (s.status !== "aprovado" && s.status !== "concluido") {
      sectionParas.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: `[Seção ${s.status} — pendente de aprovação]`,
              italics: true,
              color: "B45309",
              size: 18,
            }),
          ],
        }),
      );
    }

    if (isIntelligence && (s.dados_extraidos || s.validacao || s.analise_ia || s.conclusao_ia)) {
      // Renderização 5-blocos (MD-RMA-REPORT-INTELLIGENCE-001)
      const block = (label: string, text: string) => {
        sectionParas.push(new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: label, bold: true, size: 22, color: "1E40AF" })],
        }));
        sectionParas.push(...plainParagraphs(text || "—"));
      };
      const j = (v: any) => {
        if (v == null) return "—";
        if (typeof v === "string") return v;
        try { return JSON.stringify(v, null, 2); } catch { return String(v); }
      };
      if (s.conteudo) block("Narrativa", s.conteudo);
      if (s.dados_extraidos) block("Dados extraídos", j(s.dados_extraidos));
      if (s.evidence_count != null) {
        sectionParas.push(new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({
            text: `Evidências: ${s.evidence_count} referência(s) registrada(s).`,
            italics: true, size: 20, color: "555555",
          })],
        }));
      }
      if (s.validacao) block("Validação", j(s.validacao));
      if (s.analise_ia) block("Análise IA", s.analise_ia);
      if (s.conclusao_ia) {
        const c = s.conclusao_ia;
        const txt = typeof c === "string" ? c
          : `Status: ${c?.status ?? "—"}\nRisco: ${c?.risco ?? s.risco ?? "—"}${c?.impacto ? `\nImpacto: ${c.impacto}` : ""}${c?.recomendacao ? `\nRecomendação: ${c.recomendacao}` : ""}${c?.texto ? `\n\n${c.texto}` : ""}`;
        block("Conclusão IA", txt);
      }
    } else {
      sectionParas.push(...plainParagraphs(s.conteudo));
    }
  }

  return new Document({
    creator: "BEx RMA IA",
    title: opts.titulo,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 32, bold: true, color: "0F172A" },
          paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 26, bold: true, color: "1E40AF" },
          paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 22, bold: true, color: "334155" },
          paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        footers: {
          default: new Footer({
            children: isDip
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({
                      text: "Administradora Judicial · Recomendação CNJ 72/2020",
                      size: 14, color: "888888", italics: true,
                    })],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ text: "Página ", size: 14, color: "888888" }),
                      new TextRun({ children: [PageNumber.CURRENT], size: 14, color: "888888" }),
                      new TextRun({ text: " / ", size: 14, color: "888888" }),
                      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: "888888" }),
                    ],
                  }),
                ]
              : [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ text: "BEx RMA IA · ", size: 16, color: "888888" }),
                      new TextRun({ text: "Página ", size: 16, color: "888888" }),
                      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888" }),
                      new TextRun({ text: " / ", size: 16, color: "888888" }),
                      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "888888" }),
                    ],
                  }),
                ],
          }),
        },
        children: [...coverParas, ...tocParas, ...headerParas, ...sectionParas],
      },
    ],
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const document_id: string | undefined = body.document_id;
    const force: boolean = !!body.force;
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: doc, error: dErr } = await supabase
      .from("rma_documents")
      .select("*")
      .eq("id", document_id)
      .maybeSingle();
    if (dErr || !doc) throw new Error(dErr?.message || "Documento não encontrado");

    const { data: secs, error: sErr } = await supabase
      .from("rma_document_sections")
      .select("id, numero, titulo, conteudo_editado, conteudo_ia, status, ordem, dados_extraidos, validacao, analise_ia, conclusao_ia, risco, risk_score")
      .eq("document_id", document_id)
      .order("ordem", { ascending: true });
    if (sErr) throw sErr;

    // Evidence counts por seção (apenas intelligence)
    const evidenceCount: Record<string, number> = {};
    if (doc.tipo === "rma_intelligence" && secs && secs.length) {
      const { data: ev } = await supabase
        .from("rma_section_evidences")
        .select("section_id")
        .eq("document_id", document_id);
      for (const e of (ev || []) as any[]) {
        evidenceCount[e.section_id] = (evidenceCount[e.section_id] || 0) + 1;
      }
    }

    const total = secs?.length ?? 0;
    const ok = (secs || []).filter((s) => s.status === "aprovado" || s.status === "concluido").length;
    const pct = total ? Math.round((ok * 100) / total) : 0;

    const minPct = MIN_PCT_BY_TIPO[doc.tipo] ?? MIN_PCT_DEFAULT;
    if (!force && pct < minPct) {
      return new Response(
        JSON.stringify({ skipped: true, pct, min_pct: minPct, tipo: doc.tipo, reason: `pct ${pct}% < ${minPct}% mínimo para ${doc.tipo}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const novaVersao = (doc.arquivo_final_versao || 0) + 1;
    const geradoEm = new Date();

    // Capa institucional: para DIP e Intelligence (lê empresa + metadados do mês de referência)
    let capa: any = undefined;
    if (doc.tipo === "rma_mensal_dip" || doc.tipo === "rma_intelligence") {
      const { data: empresa } = await supabase
        .from("companies")
        .select("name, cnpj, execution_year, current_period_month")
        .eq("rma_id", doc.rma_id)
        .maybeSingle();
      const meta = (doc.metadata as any) || {};
      const meses = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
      const mesNum = meta.mes_referencia ?? empresa?.current_period_month ?? null;
      const anoNum = meta.ano_referencia ?? empresa?.execution_year ?? null;
      capa = {
        empresa: empresa?.name ?? null,
        cnpj: empresa?.cnpj ?? null,
        juizo: meta.juizo ?? null,
        autos: meta.autos ?? null,
        mes_referencia: mesNum && anoNum ? `${meses[(mesNum as number) - 1]} DE ${anoNum}` : null,
        responsavel_tecnico: meta.responsavel_tecnico ?? null,
        administrador_judicial: meta.administrador_judicial ?? null,
      };
    }

    const docx = buildDoc({
      titulo: doc.titulo,
      tipo: doc.tipo,
      pct,
      geradoEm,
      versao: novaVersao,
      sections: (secs || []).map((s: any) => ({
        numero: s.numero,
        titulo: s.titulo,
        conteudo: s.conteudo_editado || s.conteudo_ia || "",
        status: s.status,
        dados_extraidos: s.dados_extraidos ?? null,
        validacao: s.validacao ?? null,
        analise_ia: s.analise_ia ?? null,
        conclusao_ia: s.conclusao_ia ?? null,
        risco: s.risco ?? null,
        risk_score: s.risk_score ?? null,
        evidence_count: evidenceCount[s.id],
      })),
      capa,
      executive_summary: (doc as any).executive_summary ?? null,
      health_score: (doc as any).health_score ?? null,
      risk_global: (doc as any).risk_global ?? null,
    });

    const buffer = await Packer.toBuffer(docx);
    const safeTitle = (doc.titulo || "documento").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
    const path = `${doc.rma_id}/${doc.tipo}/${safeTitle}_v${novaVersao}.docx`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);

    const { error: updErr } = await supabase
      .from("rma_documents")
      .update({
        arquivo_final_url: signed?.signedUrl ?? null,
        arquivo_final_versao: novaVersao,
        arquivo_final_gerado_em: geradoEm.toISOString(),
        arquivo_final_pct: pct,
        status: pct >= 100 ? "finalizado" : "pre_parecer",
        progresso: pct,
      })
      .eq("id", document_id);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({
        ok: true,
        pct,
        versao: novaVersao,
        path,
        url: signed?.signedUrl ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
