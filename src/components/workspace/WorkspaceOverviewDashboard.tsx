import { FileText, Cpu, CheckCircle2, AlertTriangle, TrendingUp } from "lucide-react";

interface Props {
  filesTotal: number;
  filesProcessed: number;
  scorePct: number;
  topicsCompletos: number;
  topicsIncompletos: number;
  topicsPendentes: number;
  topicsTotal: number;
  pendenciasCount: number;
  onResolve?: () => void;
}

const fmtPct = (n: number) => `${Math.max(0, Math.min(100, Math.round(n)))}%`;

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-[hsl(220,15%,92%)] overflow-hidden">
      <div className="h-full transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
    </div>
  );
}

export default function WorkspaceOverviewDashboard({
  filesTotal, filesProcessed, scorePct,
  topicsCompletos, topicsIncompletos, topicsPendentes, topicsTotal,
  pendenciasCount, onResolve,
}: Props) {
  const procPct = filesTotal > 0 ? Math.round((filesProcessed / filesTotal) * 100) : 0;
  const compPct = topicsTotal > 0 ? Math.round((topicsCompletos / topicsTotal) * 100) : 0;
  const procColor = procPct >= 67 ? "hsl(142,76%,36%)" : procPct >= 33 ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)";
  const scoreColor = scorePct >= 67 ? "hsl(142,76%,36%)" : scorePct >= 33 ? "hsl(38,92%,50%)" : "hsl(0,84%,60%)";

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Visão geral do Prospeccao AJ</h2>
          <p className="text-xs text-muted-foreground">
            Processamento de documentos, completude do score e status dos tópicos.
          </p>
        </div>
        {pendenciasCount > 0 && (
          <button
            onClick={onResolve}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[hsl(217,91%,50%)] text-[hsl(217,91%,40%)] hover:bg-[hsl(217,91%,50%)]/5 transition-colors"
          >
            Ver {pendenciasCount} pendências
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Arquivos no OneDrive */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <FileText className="w-3.5 h-3.5" /> Arquivos
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{filesTotal}</div>
          <div className="text-[11px] text-muted-foreground">no OneDrive (competência)</div>
        </div>

        {/* Em processamento — espelha o Worker / Treinar IA */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Cpu className="w-3.5 h-3.5" /> Em processamento
          </div>
          <div className="mt-1 flex items-end gap-2">
            <div className="text-2xl font-bold tabular-nums" style={{ color: procColor }}>{fmtPct(procPct)}</div>
            <div className="text-[11px] text-muted-foreground pb-1">{filesProcessed}/{filesTotal} lidos</div>
          </div>
          <div className="mt-2"><MiniBar pct={procPct} color={procColor} /></div>
        </div>

        {/* Completude (score) */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <TrendingUp className="w-3.5 h-3.5" /> Completude
          </div>
          <div className="mt-1 flex items-end gap-2">
            <div className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>{fmtPct(scorePct)}</div>
            <div className="text-[11px] text-muted-foreground pb-1">score global</div>
          </div>
          <div className="mt-2"><MiniBar pct={scorePct} color={scoreColor} /></div>
        </div>

        {/* Status dos tópicos */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <CheckCircle2 className="w-3.5 h-3.5" /> Status dos tópicos
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {topicsCompletos}<span className="text-base font-noprospecçãol text-muted-foreground">/{topicsTotal}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="text-[hsl(142,76%,30%)] font-semibold">{topicsCompletos} OK</span>
            <span className="text-[hsl(38,92%,40%)] font-semibold">{topicsIncompletos} parc.</span>
            <span className="text-[hsl(0,84%,55%)] font-semibold">{topicsPendentes} pend.</span>
          </div>
          <div className="mt-1.5"><MiniBar pct={compPct} color="hsl(217,91%,50%)" /></div>
        </div>
      </div>

      {procPct >= 80 && scorePct < procPct - 10 && (
        <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground bg-[hsl(38,92%,50%)]/8 border border-[hsl(38,92%,50%)]/20 rounded-md px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[hsl(38,92%,50%)] flex-shrink-0 mt-0.5" />
          <span>
            <strong className="text-foreground">{fmtPct(procPct)}</strong> dos arquivos já foram lidos pelo worker, mas a
            completude do score é de <strong className="text-foreground">{fmtPct(scorePct)}</strong> — alguns tópicos
            ainda não foram classificados pela IA.
          </span>
        </div>
      )}
    </div>
  );
}
