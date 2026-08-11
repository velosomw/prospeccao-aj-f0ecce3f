import { useMemo } from "react";
import { Upload, FileText, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Eye, Download } from "lucide-react";
import type { ScoreFile } from "@/lib/prospecçãoScore";
import ProspecçãoProcessamentoTab from "@/components/prospecção/ProspecçãoProcessamentoTab";
import OneDriveFoldersStatus from "@/components/workspace/OneDriveFoldersStatus";
import LearningUploadPanel from "@/components/workspace/stages/LearningUploadPanel";
import type { ProspecçãoEntry } from "@/types/prospecção";

interface Props {
  prospecção: ProspecçãoEntry;
  companyId: string | null;
  scoreFiles: ScoreFile[];
  ano?: number | null;
  mes?: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  Válido: "bg-[hsl(142,76%,36%)]/15 text-[hsl(142,76%,30%)] border border-[hsl(142,76%,36%)]/30",
  Pendente: "bg-[hsl(38,92%,50%)]/15 text-[hsl(38,92%,40%)] border border-[hsl(38,92%,50%)]/30",
  Rejeitado: "bg-[hsl(0,84%,60%)]/15 text-[hsl(0,84%,55%)] border border-[hsl(0,84%,60%)]/30",
  "Em revisão": "bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,50%)] border border-[hsl(217,91%,50%)]/30",
};

// Classifica status real vindo de `onedrive_files.status`.
// Valores observados em produção: processed, manual_uploaded, manual_upload_required, error.
function classify(status: string | null | undefined): "Válido" | "Pendente" | "Rejeitado" | "Em revisão" {
  const s = (status || "").toLowerCase();
  if (s.includes("error") || s.includes("fail") || s.includes("reject")) return "Rejeitado";
  if (s.includes("processed") || s.includes("uploaded") || s.includes("ok") || s.includes("active") || s.includes("valid")) return "Válido";
  if (s.includes("review") || s.includes("revis")) return "Em revisão";
  return "Pendente";
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
};

export default function StageDadosUpload({ prospecção, companyId, scoreFiles, ano, mes }: Props) {
  const stats = useMemo(() => {
    const total = scoreFiles.length;
    let validos = 0, pendentes = 0, rejeitados = 0;
    for (const f of scoreFiles) {
      const c = classify((f as any).status);
      if (c === "Válido") validos++;
      else if (c === "Rejeitado") rejeitados++;
      else pendentes++;
    }
    const prep = total > 0 ? Math.round((validos / total) * 100) : 0;
    return { enviados: total, validos, pendentes, rejeitados, prep };
  }, [scoreFiles]);

  // Documentos Obrigatórios reais — derivados da lista de arquivos.
  // Mostra os 5 mais relevantes: prioriza pendentes/rejeitados (precisam de ação),
  // depois os processados mais recentes.
  const docs = useMemo(() => {
    const enriched = scoreFiles.map((f: any) => {
      const status = classify(f.status);
      return {
        nome: f.file_name || f.path || "Arquivo",
        status,
        enviado: fmtDate(f.last_processed_at),
        validade: "—",
        priority: status === "Rejeitado" ? 0 : status === "Pendente" ? 1 : 2,
        ts: f.last_processed_at ? Date.parse(f.last_processed_at) : 0,
      };
    });
    enriched.sort((a, b) => a.priority - b.priority || b.ts - a.ts);
    return enriched.slice(0, 6);
  }, [scoreFiles]);

  // Próximos passos derivados dinamicamente do estado real dos arquivos.
  const proximosPassos = useMemo(() => {
    const steps: string[] = [];
    if (stats.rejeitados > 0) steps.push(`Reprocessar ${stats.rejeitados} arquivo(s) com erro`);
    if (stats.pendentes > 0) steps.push(`Concluir upload/processamento de ${stats.pendentes} arquivo(s) pendente(s)`);
    if (stats.enviados === 0) steps.push("Conectar OneDrive e iniciar leitura dos documentos");
    if (steps.length === 0) steps.push("Todos os documentos da competência estão válidos");
    return steps.slice(0, 4);
  }, [stats]);

  return (
    <div className="space-y-4">
      {/* Cards de status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Status da Preparação</h3>
          <div className="text-5xl font-bold text-foreground leading-none">{stats.prep}%</div>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            {stats.validos} de {stats.enviados} arquivo(s) válidos
          </p>
          <div className="h-2 rounded-full bg-[hsl(220,15%,92%)] overflow-hidden">
            <div className="h-full bg-[hsl(142,76%,36%)] transition-all" style={{ width: `${stats.prep}%` }} />
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Próximos Passos</h3>
          <ul className="space-y-2">
            {proximosPassos.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-foreground">
                <div className="w-4 h-4 rounded border-2 border-[hsl(217,91%,50%)] flex-shrink-0 mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Resumo de Documentos</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[hsl(142,76%,36%)]" /> Válidos</span>
              <span className="font-bold">{String(stats.validos).padStart(2, "0")}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[hsl(38,92%,50%)]" /> Pendentes</span>
              <span className="font-bold">{String(stats.pendentes).padStart(2, "0")}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2"><XCircle className="w-4 h-4 text-[hsl(0,84%,60%)]" /> Rejeitados</span>
              <span className="font-bold">{String(stats.rejeitados).padStart(2, "0")}</span>
            </li>
            <li className="flex items-center justify-between border-t border-border pt-2 mt-2">
              <span className="text-muted-foreground">Total enviados</span>
              <span className="font-bold">{String(stats.enviados).padStart(2, "0")}</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Documentos (reais) + Upload */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3">
        <div className="bg-white border border-border rounded-lg p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">
            Documentos a revisar ({docs.length} de {stats.enviados})
          </h3>
          {docs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum arquivo encontrado para a competência selecionada.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-muted-foreground border-b">
                    <th className="py-2 font-semibold">Documento</th>
                    <th className="py-2 font-semibold">Status</th>
                    <th className="py-2 font-semibold">Último processamento</th>
                    <th className="py-2 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d, i) => (
                    <tr key={`${d.nome}-${i}`} className="border-b last:border-0">
                      <td className="py-2.5 font-medium truncate max-w-[280px]" title={d.nome}>{d.nome}</td>
                      <td className="py-2.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_COLORS[d.status]}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{d.enviado}</td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-1 text-muted-foreground">
                          <button className="p-1 hover:text-foreground" aria-label="Visualizar"><Eye className="w-4 h-4" /></button>
                          <button className="p-1 hover:text-foreground" aria-label="Baixar"><Download className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-md bg-[hsl(217,91%,50%)]/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-foreground leading-tight">Upload de Balancete & Documentos</h4>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Selecione a pasta de referência e envie o balancete (extrator-mestre) ou DRE/documentos complementares.
              </p>
            </div>
          </div>
          <LearningUploadPanel
            prospecçãoId={prospecção.id}
            companyId={companyId}
            compact
            maxFiles={10}
            lockedYear={ano ?? null}
            lockedMonth={mes ?? null}
          />
        </div>
      </div>

      {/* Pastas OneDrive — status de leitura/extração (filtrado pela competência ativa) */}
      <OneDriveFoldersStatus companyId={companyId} ano={ano ?? null} mes={mes ?? null} />

      {/* Detalhes profundos: Processamento e arquivos */}
      <details className="bg-white border border-border rounded-lg group">
        <summary className="cursor-pointer p-4 flex items-center justify-between text-sm font-bold text-foreground">
          <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Histórico & Processamento de Arquivos</span>
          <span className="text-xs text-muted-foreground group-open:hidden">Expandir</span>
          <span className="text-xs text-muted-foreground hidden group-open:inline">Recolher</span>
        </summary>
        <div className="p-4 pt-0">
          <ProspecçãoProcessamentoTab prospecção={prospecção} companyId={companyId} />
        </div>
      </details>
    </div>
  );
}
