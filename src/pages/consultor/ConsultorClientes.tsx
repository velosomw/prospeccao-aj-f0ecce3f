import { Fragment, useMemo, useState } from "react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import {
  Mail, Printer, Send, XCircle, ChevronDown, ChevronRight, FileText,
  Download, Sparkles, MapPin, CalendarClock, User, CheckCircle2, Clock,
} from "lucide-react";
import { previewCarta, downloadCarta, printCarta } from "@/services/carta/cartaPdfEngine";
import { toast } from "@/hooks/use-toast";


type CartaStatus = "Em elaboração" | "Enviada";

interface LinhaCarta {
  id: string;
  empresa: string;
  processo: string;
  aj: string;
  endereco: string;
  dataAtivacao: string;
  carta: CartaStatus;
  reenvio: "90 dias" | "120 dias" | "150 dias";
  ultimoEnvio: string | null;
  proximoEnvio: string;
  diasParaEnvio: number;
  impressa: boolean;
  historico: { data: string; evento: string; canal: string; status: "ok" | "pendente" | "falha" }[];
}

// Mockup: linhas derivadas das recuperações judiciais da Planilha Padrão Prospeccao
const LINHAS: LinhaCarta[] = [];

const statusPill = (s: CartaStatus) =>
  s === "Enviada"
    ? "bg-green-50 text-green-700 border-green-100"
    : "bg-amber-50 text-amber-700 border-amber-100";

const reenvioPill = (r: string) =>
  r === "90 dias"
    ? "bg-blue-50 text-primary border-blue-100"
    : r === "120 dias"
    ? "bg-purple-50 text-purple-700 border-purple-100"
    : "bg-orange-50 text-orange-700 border-orange-100";

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
      <div className="text-xl font-bold text-foreground mt-1 leading-tight">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

export default function ConsultorClientes() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toLetterData = (l: LinhaCarta) => {
    const partes = l.endereco.split(",").map((p) => p.trim());
    const cidadeUf = partes[partes.length - 1] || "";
    return {
      cliente: l.empresa,
      contato: l.endereco,
      processo: l.processo,
      administrador: l.aj,
      cidade: cidadeUf,
      vara: "Vara de Falências e Recuperações Judiciais",
      tribunal: "Tribunal de Justiça",
      referenceDate: new Date(2026, 7, 3),
    };
  };

  const runCarta = async (acao: "preview" | "download" | "print", l: LinhaCarta) => {
    setBusy(l.id);
    try {
      const data = toLetterData(l);
      if (acao === "preview") await previewCarta(data);
      else if (acao === "download") await downloadCarta(data);
      else await printCarta(data);
    } catch (e) {
      toast({
        title: "Não foi possível gerar a carta",
        description: e instanceof Error ? e.message : "Erro no motor editorial.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };


  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return LINHAS;
    return LINHAS.filter((l) =>
      [l.empresa, l.aj, l.processo, l.endereco].some((v) => v.toLowerCase().includes(q)),
    );
  }, [search]);

  const enviadas = LINHAS.filter((l) => l.carta === "Enviada").length;
  const impressas = LINHAS.filter((l) => l.impressa).length;
  const reenviadas = LINHAS.filter((l) => l.carta === "Enviada" && l.diasParaEnvio < 0).length;
  const naoEnviadas = LINHAS.length - enviadas;

  return (
    <ConsultorPageShell
      title="Planilha de Carta"
      subtitle="Gestão das cartas geradas a partir das recuperações judiciais ativas na Planilha Padrão Prospecção."
      search={search}
      onSearch={setSearch}
      kpis={[
        { label: "Total de Cartas", value: LINHAS.length, icon: Mail, tone: "blue" },
        { label: "Total de Cartas Impressas", value: impressas, icon: Printer, tone: "purple" },
        { label: "Total Cartas Reenviadas", value: reenviadas, icon: Send, tone: "orange" },
        { label: "Total de Cartas Não enviadas", value: naoEnviadas, icon: XCircle, tone: "red" },
      ]}
    >
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Empresas com carta enviada</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clique na linha para abrir o processamento da carta, dashboards e histórico de envio.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-[hsl(217,91%,50%)] text-white">
              <tr>
                {["", "Empresa", "Nome do AJ", "Endereço", "Data ativação", "Carta gerada", "Reenvio"].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-white/20 last:border-r-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">Nenhuma carta encontrada.</td></tr>
              )}
              {rows.map((l, i) => {
                const isOpen = open === l.id;
                return (
                  <Fragment key={l.id}>
                    <tr
                      onClick={() => setOpen(isOpen ? null : l.id)}
                      className={`cursor-pointer hover:bg-blue-50/50 ${isOpen ? "bg-blue-50/60" : i % 2 === 0 ? "bg-white" : "bg-muted/20"}`}
                    >
                      <td className="px-3 py-2 border-b w-8">
                        {isOpen ? <ChevronDown className="w-4 h-4 text-primary" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </td>
                      <td className="px-3 py-2 border-b max-w-[280px]">
                        <span className="block font-semibold truncate" title={l.empresa}>{l.empresa}</span>
                        <span className="block text-[10px] text-muted-foreground font-mono">{l.processo}</span>
                      </td>
                      <td className="px-3 py-2 border-b whitespace-nowrap">{l.aj}</td>
                      <td className="px-3 py-2 border-b max-w-[260px]"><span className="block truncate" title={l.endereco}>{l.endereco}</span></td>
                      <td className="px-3 py-2 border-b whitespace-nowrap">{l.dataAtivacao}</td>
                      <td className="px-3 py-2 border-b whitespace-nowrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusPill(l.carta)}`}>{l.carta}</span>
                      </td>
                      <td className="px-3 py-2 border-b whitespace-nowrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${reenvioPill(l.reenvio)}`}>{l.reenvio}</span>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={7} className="bg-muted/30 border-b p-4 lg:p-5">
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <MiniStat label="Carta" value={l.carta} />
                            <MiniStat label="Último envio" value={l.ultimoEnvio || "—"} />
                            <MiniStat label="Nome do AJ" value={l.aj} />
                            <MiniStat
                              label="Próximo envio"
                              value={`${l.diasParaEnvio} dias`}
                              hint={l.proximoEnvio}
                            />
                          </div>

                          <div className="bg-white rounded-xl border mt-4 p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-[hsl(217,91%,50%)] flex items-center justify-center">
                                <FileText className="w-4.5 h-4.5 text-white" />
                              </div>
                              <h4 className="text-base font-bold">Carta</h4>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-4">
                              <button
                                onClick={() => runCarta("preview", l)}
                                disabled={busy === l.id}
                                className="inline-flex items-center gap-2 text-xs font-medium px-3 h-9 rounded-lg border bg-white hover:bg-muted/40 disabled:opacity-50"
                              >
                                <Sparkles className="w-3.5 h-3.5" /> Preview da Carta
                              </button>
                              <button
                                onClick={() => runCarta("download", l)}
                                disabled={busy === l.id}
                                className="inline-flex items-center gap-2 text-xs font-medium px-3 h-9 rounded-lg border bg-white hover:bg-muted/40 disabled:opacity-50"
                              >
                                <Download className="w-3.5 h-3.5" /> Exportar PDF
                              </button>
                              <button
                                onClick={() => runCarta("print", l)}
                                disabled={l.carta !== "Enviada" || busy === l.id}
                                className="inline-flex items-center gap-2 text-xs font-semibold px-3 h-9 rounded-lg bg-[hsl(217,91%,50%)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <Printer className="w-3.5 h-3.5" /> Imprimir Carta
                              </button>
                            </div>

                            {l.carta !== "Enviada" && (
                              <p className="text-[11px] text-amber-700 mt-2">
                                Impressão liberada somente após a carta ser finalizada e enviada.
                              </p>
                            )}
                          </div>

                          <div className="grid lg:grid-cols-2 gap-4 mt-4">
                            <div className="bg-white rounded-xl border p-4">
                              <h5 className="text-xs font-semibold mb-3">Dados do processamento</h5>
                              <ul className="space-y-2 text-xs text-muted-foreground">
                                <li className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> AJ nomeado: <span className="text-foreground font-medium">{l.aj}</span></li>
                                <li className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 mt-0.5" /> Endereço: <span className="text-foreground font-medium">{l.endereco}</span></li>
                                <li className="flex items-center gap-2"><CalendarClock className="w-3.5 h-3.5" /> Ativação: <span className="text-foreground font-medium">{l.dataAtivacao}</span></li>
                                <li className="flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Ciclo de reenvio: <span className="text-foreground font-medium">{l.reenvio}</span></li>
                              </ul>
                            </div>

                            <div className="bg-white rounded-xl border p-4">
                              <h5 className="text-xs font-semibold mb-3">Histórico de envio</h5>
                              <ol className="space-y-3">
                                {l.historico.map((h, hi) => (
                                  <li key={hi} className="flex items-start gap-2">
                                    {h.status === "ok" ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5" />
                                    ) : h.status === "pendente" ? (
                                      <Clock className="w-3.5 h-3.5 text-amber-600 mt-0.5" />
                                    ) : (
                                      <XCircle className="w-3.5 h-3.5 text-red-600 mt-0.5" />
                                    )}
                                    <div>
                                      <div className="text-xs font-medium">{h.evento}</div>
                                      <div className="text-[11px] text-muted-foreground">{h.data} · {h.canal}</div>
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ConsultorPageShell>
  );
}
