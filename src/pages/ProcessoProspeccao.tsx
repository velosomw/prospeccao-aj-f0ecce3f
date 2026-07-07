import { useMemo, useState } from "react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import {
  Mail, MailOpen, MailCheck, MailX, FileSpreadsheet,
  CheckCircle2, AlertTriangle, Clock, Building2,
} from "lucide-react";

// ============================================================
// MOCKUP — Processo Prospecção por E-mail
// Acompanhamento diário: leitura de e-mails + extração de planilhas
// Dados fictícios para validação de conceito.
// ============================================================

type EmailStatus = "lido" | "nao_lido" | "falha";
type ExtracaoStatus = "extraido" | "processando" | "falha" | "pendente";

interface EmailRow {
  id: string;
  hora: string;
  remetente: string;
  empresa: string;
  assunto: string;
  anexo: string | null;
  emailStatus: EmailStatus;
  extracaoStatus: ExtracaoStatus;
  linhasExtraidas: number | null;
}

const MOCK: EmailRow[] = [
  { id: "1", hora: "08:12", remetente: "prospeccao@e-xuon.com.br",     empresa: "E-Xuon",           assunto: "Planilha diária RJ - 07/07/2026",           anexo: "prospeccao_20260707.xlsx", emailStatus: "lido",     extracaoStatus: "extraido",    linhasExtraidas: 48 },
  { id: "2", hora: "08:31", remetente: "monitor@juridico-brasil.com",  empresa: "Jurídico Brasil",  assunto: "Recuperações Judiciais - Diário",           anexo: "rj_diario.xlsx",           emailStatus: "lido",     extracaoStatus: "extraido",    linhasExtraidas: 22 },
  { id: "3", hora: "09:05", remetente: "envios@datalaw.com.br",        empresa: "DataLaw",          assunto: "Planilha Padrão AJ - lote 07/07",           anexo: "aj_padrao_lote.xlsx",      emailStatus: "lido",     extracaoStatus: "processando", linhasExtraidas: null },
  { id: "4", hora: "10:22", remetente: "alertas@e-xuon.com.br",        empresa: "E-Xuon",           assunto: "Complemento — novos processos SP",          anexo: "complemento_sp.xlsx",      emailStatus: "lido",     extracaoStatus: "falha",       linhasExtraidas: null },
  { id: "5", hora: "11:47", remetente: "no-reply@tribunais-br.com",    empresa: "Tribunais BR",     assunto: "Distribuições da semana",                   anexo: null,                       emailStatus: "lido",     extracaoStatus: "pendente",    linhasExtraidas: null },
  { id: "6", hora: "13:03", remetente: "boletim@lexpro.com.br",        empresa: "LexPro",           assunto: "Boletim RJ 07/07",                          anexo: "boletim.xlsx",             emailStatus: "nao_lido", extracaoStatus: "pendente",    linhasExtraidas: null },
  { id: "7", hora: "14:19", remetente: "envios@e-xuon.com.br",         empresa: "E-Xuon",           assunto: "Retificação planilha manhã",                anexo: "retificacao.xlsx",         emailStatus: "lido",     extracaoStatus: "extraido",    linhasExtraidas: 12 },
  { id: "8", hora: "15:44", remetente: "corporativo@aj-monitor.com",   empresa: "AJ Monitor",       assunto: "Novos processos - região Sul",              anexo: "sul.xlsx",                 emailStatus: "falha",    extracaoStatus: "falha",       linhasExtraidas: null },
];

const emailBadge: Record<EmailStatus, { label: string; bg: string; fg: string; Icon: any }> = {
  lido:     { label: "Lido",       bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", Icon: MailOpen },
  nao_lido: { label: "Não lido",   bg: "hsl(38,92%,95%)",  fg: "hsl(38,92%,40%)",  Icon: Mail },
  falha:    { label: "Falha",      bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,40%)",   Icon: MailX },
};

const extracaoBadge: Record<ExtracaoStatus, { label: string; bg: string; fg: string; Icon: any }> = {
  extraido:    { label: "Extraído",    bg: "hsl(142,76%,93%)", fg: "hsl(142,76%,30%)", Icon: CheckCircle2 },
  processando: { label: "Processando", bg: "hsl(217,91%,96%)", fg: "hsl(217,91%,45%)", Icon: Clock },
  falha:       { label: "Falha",       bg: "hsl(0,84%,95%)",   fg: "hsl(0,84%,40%)",   Icon: AlertTriangle },
  pendente:    { label: "Pendente",    bg: "hsl(220,15%,93%)", fg: "hsl(220,15%,40%)", Icon: Clock },
};

export default function ProcessoProspeccao() {
  const [search, setSearch] = useState("");
  const [empresaFilter, setEmpresaFilter] = useState<string>("todas");

  const empresas = useMemo(
    () => Array.from(new Set(MOCK.map((r) => r.empresa))),
    [],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MOCK.filter((r) => {
      if (empresaFilter !== "todas" && r.empresa !== empresaFilter) return false;
      if (!q) return true;
      return [r.remetente, r.empresa, r.assunto, r.anexo]
        .some((v) => v && v.toLowerCase().includes(q));
    });
  }, [search, empresaFilter]);

  const total = rows.length;
  const lidos = rows.filter((r) => r.emailStatus === "lido").length;
  const naoLidos = rows.filter((r) => r.emailStatus === "nao_lido").length;
  const extraidos = rows.filter((r) => r.extracaoStatus === "extraido").length;
  const falhas = rows.filter(
    (r) => r.emailStatus === "falha" || r.extracaoStatus === "falha",
  ).length;
  const linhas = rows.reduce((s, r) => s + (r.linhasExtraidas || 0), 0);

  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <ConsultorPageShell
      title="Processo Prospecção"
      subtitle={`Acompanhamento diário de e-mails recebidos e extração de planilhas por IA — ${hoje}. (mockup — dados fictícios)`}
      search={search}
      onSearch={setSearch}
      kpis={[
        { label: "E-mails Recebidos", value: total,      hint: "Hoje",            icon: Mail,            tone: "blue"   },
        { label: "Lidos pela IA",     value: lidos,      hint: "Processados",     icon: MailCheck,       tone: "green"  },
        { label: "Não Lidos",         value: naoLidos,   hint: "Aguardando IA",   icon: Mail,            tone: "orange" },
        { label: "Planilhas Extraídas", value: extraidos, hint: "Concluídas",     icon: FileSpreadsheet, tone: "purple" },
        { label: "Falhas",            value: falhas,     hint: "Revisar",         icon: AlertTriangle,   tone: "red"    },
        { label: "Linhas Importadas", value: linhas,     hint: "Somatório",       icon: CheckCircle2,    tone: "slate"  },
      ]}
    >
      {/* Filtro por empresa */}
      <div className="bg-white rounded-xl border p-4 mb-4 flex flex-wrap items-center gap-2">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-2">
          Empresa Remetente
        </span>
        <button
          onClick={() => setEmpresaFilter("todas")}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            empresaFilter === "todas"
              ? "bg-[hsl(217,91%,50%)] text-white border-transparent"
              : "bg-white text-foreground hover:bg-muted"
          }`}
        >
          Todas
        </button>
        {empresas.map((e) => (
          <button
            key={e}
            onClick={() => setEmpresaFilter(e)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              empresaFilter === e
                ? "bg-[hsl(217,91%,50%)] text-white border-transparent"
                : "bg-white text-foreground hover:bg-muted"
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Tabela de e-mails */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Fila diária de e-mails</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Status de leitura pela IA e extração da planilha anexa. Este conceito será refinado após a
            configuração do provedor de e-mail (IMAP / Gmail / Outlook).
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum e-mail para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[hsl(217,91%,50%)] text-white">
                <tr>
                  {[
                    "Hora", "Empresa", "Remetente", "Assunto", "Anexo (Planilha)",
                    "Leitura E-mail", "Extração Planilha", "Linhas",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-white/20 last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const eb = emailBadge[r.emailStatus];
                  const xb = extracaoBadge[r.extracaoStatus];
                  const EIcon = eb.Icon;
                  const XIcon = xb.Icon;
                  return (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                      <td className="px-3 py-2 border-b font-mono whitespace-nowrap">{r.hora}</td>
                      <td className="px-3 py-2 border-b font-semibold">{r.empresa}</td>
                      <td className="px-3 py-2 border-b text-muted-foreground">{r.remetente}</td>
                      <td className="px-3 py-2 border-b max-w-[280px]">
                        <span className="block truncate" title={r.assunto}>{r.assunto}</span>
                      </td>
                      <td className="px-3 py-2 border-b">
                        {r.anexo ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-[hsl(142,76%,36%)]" />
                            {r.anexo}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">sem anexo</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: eb.bg, color: eb.fg }}
                        >
                          <EIcon className="w-3 h-3" /> {eb.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: xb.bg, color: xb.fg }}
                        >
                          <XIcon className="w-3 h-3" /> {xb.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b font-mono">
                        {r.linhasExtraidas != null ? r.linhasExtraidas : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aviso mockup */}
      <div className="mt-4 rounded-xl border border-dashed p-4 bg-[hsl(38,92%,98%)] text-[hsl(38,92%,30%)] text-xs flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Mockup para validação de conceito.</strong> A próxima etapa será conectar a caixa
          de e-mail (E-Xuon e outras), automatizar a leitura via IA, extrair as planilhas anexas e
          alimentar a base <em>Planilha Padrão Prospecção</em>.
        </div>
      </div>
    </ConsultorPageShell>
  );
}
