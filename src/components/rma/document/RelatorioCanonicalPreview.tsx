import { useMemo, useState } from "react";
import { FileText, ScrollText, BookOpen, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Circle } from "lucide-react";

/**
 * Sumário canônico oficial do RMA — DIP/Capital AJ.
 * Esta é a fonte de verdade para a visualização: TODAS as seções e
 * subseções devem aparecer, independentemente do estado dos dados.
 * Seções sem conteúdo exibem o tipo de problema e a condição para solução.
 */
export interface CanonicalNode {
  numero: string;
  titulo: string;
  children?: CanonicalNode[];
}

export const CANONICAL_SUMARIO: CanonicalNode[] = [
  { numero: "1", titulo: "Houve alteração da atividade empresarial?" },
  { numero: "2", titulo: "Houve alteração da estrutura societária e dos órgãos de administração?" },
  { numero: "3", titulo: "Houve abertura ou fechamento de estabelecimentos?" },
  { numero: "4", titulo: "Segmento de atuação · Fontes de informação · Associação · Sindicato" },
  {
    numero: "5", titulo: "Quadro de funcionários",
    children: [
      { numero: "5.1", titulo: "Número de funcionários/colaboradores total" },
      { numero: "5.2", titulo: "Número de funcionários CLT" },
      { numero: "5.3", titulo: "Número de pessoas jurídicas" },
      {
        numero: "5.4", titulo: "Folha de Pagamentos CLT",
        children: [
          { numero: "5.4.1", titulo: "Valores da Folha de Pagamento e Quitação" },
          { numero: "5.4.2", titulo: "Quitação das obrigações Sociais — INSS e FGTS" },
        ],
      },
    ],
  },
  {
    numero: "6", titulo: "Análise dos dados contábeis e informações financeiras",
    children: [
      {
        numero: "6.1", titulo: "Ativo (descrição / evolução)",
        children: [
          { numero: "6.1.1", titulo: "Ativo Circulante" },
          { numero: "6.1.2", titulo: "Ativo Não Circulante" },
          { numero: "6.1.3", titulo: "Estoques" },
          { numero: "6.1.4", titulo: "Imobilizado" },
        ],
      },
      {
        numero: "6.2", titulo: "Passivo",
        children: [
          { numero: "6.2.1", titulo: "Passivo Circulante" },
          { numero: "6.2.2", titulo: "Passivo Não Circulante" },
        ],
      },
      {
        numero: "6.3", titulo: "Passivo Extraconcursal",
        children: [
          { numero: "6.3.1", titulo: "Fiscal" },
          { numero: "6.3.2", titulo: "Contingência" },
          { numero: "6.3.3", titulo: "Inscrito na dívida ativa" },
          { numero: "6.3.4", titulo: "Cessão fiduciária de títulos e direitos creditórios" },
          { numero: "6.3.5", titulo: "Alienação fiduciária" },
          { numero: "6.3.6", titulo: "Arrendamentos mercantis" },
          { numero: "6.3.7", titulo: "Adiantamento de contrato de câmbio (ACC)" },
          { numero: "6.3.8", titulo: "Obrigação de fazer" },
          { numero: "6.3.9", titulo: "Obrigação de entregar" },
          { numero: "6.3.10", titulo: "Obrigação de dar" },
          { numero: "6.3.11", titulo: "Obrigações ilíquidas" },
        ],
      },
    ],
  },
  { numero: "7", titulo: "Patrimônio Líquido" },
  {
    numero: "8", titulo: "Endividamento Pós ajuizamento da RJ — Declaração",
    children: [
      { numero: "8.1", titulo: "Tributário" },
      { numero: "8.2", titulo: "Trabalhista" },
      { numero: "8.3", titulo: "Fornecedores" },
    ],
  },
  {
    numero: "9", titulo: "Fluxo de caixa",
    children: [
      { numero: "9.1", titulo: "Previsto x realizado no mês" },
      { numero: "9.2", titulo: "Projetado 6 meses" },
    ],
  },
  {
    numero: "10", titulo: "Contas a Pagar",
    children: [
      { numero: "10.1", titulo: "Valores vencidos — Aging 0-30 · 30-90 · 90-180 · acima 180 dias" },
      { numero: "10.2", titulo: "Valores a vencer — Aging 0-30 · 30-90 · 90-180 · acima 180 dias" },
    ],
  },
  {
    numero: "11", titulo: "Contas a receber",
    children: [
      { numero: "11.1", titulo: "Valores vencidos — Aging 0-30 · 30-90 · 90-180 · acima 180 dias" },
      { numero: "11.2", titulo: "Valores a vencer — Aging 0-30 · 30-90 · 90-180 · acima 180 dias" },
    ],
  },
  {
    numero: "12", titulo: "Demonstração de resultados (evolução)",
    children: [
      { numero: "12.1", titulo: "Observações Gerais (análise faturamento)" },
      { numero: "12.1.2", titulo: "Índices de liquidez" },
      { numero: "12.1.3", titulo: "Receita x Custo (CMV)" },
      { numero: "12.1.4", titulo: "Receita x Resultado" },
      { numero: "12.1.5", titulo: "EBITDA" },
    ],
  },
  { numero: "14", titulo: "Remuneração do Administrador Judicial" },
  {
    numero: "15", titulo: "Fatos relevantes",
    children: [
      { numero: "15.1", titulo: "Recuperandas Inativas" },
      { numero: "15.2", titulo: "Glosa Fiscal" },
      { numero: "15.3", titulo: "Dos leilões e vendas diretas realizados" },
      { numero: "15.4", titulo: "Débitos tributários dos bens" },
      { numero: "15.5", titulo: "Depósito Tributário" },
      { numero: "15.6", titulo: "Contrato Plusval" },
    ],
  },
  { numero: "16", titulo: "Conclusão" },
  { numero: "17", titulo: "Pendências" },
  { numero: "18", titulo: "Apensos/Anexos" },
];

interface SectionLike {
  numero: string | null;
  titulo: string;
  conteudo_editado: string | null;
  conteudo_ia: string | null;
  status: string;
  grounding_score?: number | null;
  ungrounded_claims?: any;
}

interface Props {
  empresa?: string;
  rmaCode?: string;
  mesReferencia?: string;
  responsavel?: string;
  juizo?: string;
  autos?: string;
  rjAutos?: string;
  administradorJudicial?: string;
  oabSP?: string;
  oabPR?: string;
  cidade?: string;
  dataExtenso?: string;
  sections: SectionLike[];
}

function diagnose(node: CanonicalNode, sec?: SectionLike): { ok: boolean; problema?: string; solucao?: string; score?: number } {
  if (!sec) {
    return {
      ok: false,
      problema: "Seção não inicializada no documento.",
      solucao: "Clique em Atualizar Relatório para gerar esta seção a partir dos dados disponíveis.",
    };
  }
  const conteudo = sec.conteudo_editado || sec.conteudo_ia;
  if (!conteudo || !conteudo.trim()) {
    return {
      ok: false,
      problema: "Sem conteúdo gerado pela IA — documento-fonte ausente no workspace.",
      solucao: "Anexar evidências (balancete, DRE, atas, contratos) na aba Dados & Upload e regenerar.",
    };
  }
  const score = sec.grounding_score ?? 0;
  const ung = Array.isArray(sec.ungrounded_claims) ? sec.ungrounded_claims.length : 0;
  if (score < 50) {
    return {
      ok: false,
      problema: `Grounding baixo (${score}/100) — valores sem ancoragem suficiente nas evidências.`,
      solucao: "Revisar fontes, conciliar balancete/DRE e regenerar a seção.",
      score,
    };
  }
  if (ung > 0) {
    return {
      ok: false,
      problema: `${ung} valor(es) sem origem identificada.`,
      solucao: "Validar números na aba Auditoria e regenerar para reconciliar.",
      score,
    };
  }
  return { ok: true, score };
}

function NodeRow({
  node, sectionByNumero, depth,
}: { node: CanonicalNode; sectionByNumero: Record<string, SectionLike>; depth: number }) {
  const sec = sectionByNumero[node.numero];
  const diag = diagnose(node, sec);
  const conteudo = sec?.conteudo_editado || sec?.conteudo_ia || "";
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = !!node.children?.length;

  return (
    <div className={depth === 0 ? "border-t border-border first:border-t-0" : ""}>
      <div
        className="flex items-start gap-2 px-3 py-2 hover:bg-muted/30"
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Recolher" : "Expandir"}
        >
          {hasChildren || conteudo ? (
            open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <Circle className="h-2 w-2 opacity-30" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-xs text-muted-foreground">{node.numero}</span>
            <span className={`text-sm ${depth === 0 ? "font-semibold" : "font-medium"} text-foreground`}>
              {node.titulo}
            </span>
            {diag.ok ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                <CheckCircle2 className="h-2.5 w-2.5" /> OK{diag.score != null ? ` · ${diag.score}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                <AlertTriangle className="h-2.5 w-2.5" /> Pendente
              </span>
            )}
          </div>
          {open && (
            <div className="mt-1.5 text-xs">
              {diag.ok ? (
                <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{conteudo}</p>
              ) : (
                <div className="rounded border border-amber-200 bg-amber-50/60 p-2 text-amber-900">
                  <p><span className="font-semibold">Problema:</span> {diag.problema}</p>
                  <p className="mt-0.5"><span className="font-semibold">Condição para solução:</span> {diag.solucao}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {open && hasChildren && (
        <div>
          {node.children!.map((c) => (
            <NodeRow key={c.numero} node={c} sectionByNumero={sectionByNumero} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RelatorioCanonicalPreview({
  empresa, rmaCode, mesReferencia, responsavel, sections,
  juizo = "JUÍZO DA 4ª VARA CÍVEL DE CASCAVEL - PARANÁ",
  autos = "0013103-92.2020.8.16.0021",
  rjAutos = "0024946-35.2012.8.16.0021",
  administradorJudicial = "CAPITAL ADMINISTRADORA JUDICIAL",
  oabSP = "150.485",
  oabPR = "52.305",
  cidade = "Cascavel",
  dataExtenso,
}: Props) {
  const sectionByNumero = useMemo(() => {
    const m: Record<string, SectionLike> = {};
    sections.forEach((s) => { if (s.numero) m[s.numero] = s; });
    return m;
  }, [sections]);

  const totalNodes = useMemo(() => {
    const count = (ns: CanonicalNode[]): number =>
      ns.reduce((a, n) => a + 1 + (n.children ? count(n.children) : 0), 0);
    return count(CANONICAL_SUMARIO);
  }, []);

  const okCount = useMemo(() => {
    let ok = 0;
    const walk = (ns: CanonicalNode[]) => {
      ns.forEach((n) => {
        if (diagnose(n, sectionByNumero[n.numero]).ok) ok++;
        if (n.children) walk(n.children);
      });
    };
    walk(CANONICAL_SUMARIO);
    return ok;
  }, [sectionByNumero]);

  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden">
      <div className="bg-muted/30 px-4 py-2 border-b text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Prévia estruturada — DIP/RMA
        </span>
        <span>{okCount}/{totalNodes} seções conformes</span>
      </div>

      {/* CAPA */}
      <section className="px-8 py-10 text-center border-b">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Capa</p>
        <h1 className="text-2xl font-bold uppercase tracking-tight">Relatório Mensal de Atividades</h1>
        <p className="text-sm text-muted-foreground mt-1">Administração Judicial · Recomendação CNJ 72/2020</p>
        <div className="mt-6 space-y-1 text-sm">
          {empresa && <p><strong>Recuperanda:</strong> {empresa}</p>}
          {rmaCode && <p><strong>Prospecção AJ:</strong> {rmaCode}</p>}
          {mesReferencia && <p><strong>Competência:</strong> {mesReferencia}</p>}
          {responsavel && <p><strong>Administrador Judicial:</strong> {responsavel}</p>}
        </div>
      </section>

      {/* CARTA AO JUÍZO */}
      <section className="px-8 py-8 border-b">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-1.5">
          <ScrollText className="h-3 w-3" /> Carta ao Juízo
        </p>
        <div className="text-center space-y-1 mb-6">
          <p className="text-sm font-bold uppercase">AO {juizo}</p>
          <p className="text-sm font-bold">AUTOS Nº {autos}</p>
          <p className="text-sm font-bold uppercase">INCIDENTE DE RELATÓRIOS MENSAIS</p>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90 text-justify">
          <strong className="uppercase">{administradorJudicial}</strong>, na qualidade de Administradora
          Judicial devidamente nomeada e compromissada nos autos de <strong>RECUPERAÇÃO JUDICIAL
          {empresa ? <> DO {empresa.toUpperCase()}</> : <> DO GRUPO DIPLOMATA</>} n. {rjAutos}</strong>,
          em trâmite perante esse Juízo, por seu Responsável Técnico,{" "}
          <strong>{responsavel || "Luis Claudio Montoro Mendes"}</strong>, vem, respeitosamente,
          apresentar <strong>RELATÓRIO MENSAL DE ATIVIDADES – Prospecção AJ</strong>, referente ao mês de{" "}
          <strong className="uppercase">{mesReferencia || "—"}</strong>, nos termos do art. 22, II,
          alínea “c” da Lei nº 11.101/2005, e alinhado às diretrizes da Recomendação nº 72/2020 do
          Conselho Nacional de Justiça.
        </p>
        <p className="text-sm text-foreground/90 mt-6 text-justify">Termos em que,</p>
        <p className="text-sm text-foreground/90 text-justify">pede deferimento.</p>
        <p className="text-sm text-foreground/90 mt-6 italic text-right">
          {cidade}, {dataExtenso || new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}.
        </p>
        <div className="mt-10 text-center space-y-0.5">
          <p className="text-sm">_______________________________________</p>
          <p className="text-sm font-bold">{administradorJudicial} Ltda.</p>
          <p className="text-sm">{responsavel || "Luis Claudio Montoro Mendes"}</p>
          {oabSP && <p className="text-xs text-muted-foreground">OAB/SP {oabSP}</p>}
          {oabPR && <p className="text-xs text-muted-foreground">OAB/PR {oabPR}</p>}
        </div>
      </section>


      {/* SUMÁRIO */}
      <section className="px-8 py-6 border-b">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <BookOpen className="h-3 w-3" /> Sumário
        </p>
        <ol className="text-sm space-y-1">
          {CANONICAL_SUMARIO.map((n) => (
            <li key={n.numero}>
              <span className="font-mono text-xs text-muted-foreground mr-2">{n.numero}</span>
              {n.titulo}
              {n.children && (
                <ul className="ml-6 mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                  {n.children.map((c) => (
                    <li key={c.numero}>
                      <span className="font-mono mr-2">{c.numero}</span>{c.titulo}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* SEÇÕES */}
      <section>
        {CANONICAL_SUMARIO.map((n) => (
          <NodeRow key={n.numero} node={n} sectionByNumero={sectionByNumero} depth={0} />
        ))}
      </section>
    </div>
  );
}
