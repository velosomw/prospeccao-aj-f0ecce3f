// WorkerControlCard — Gestor IA: controla motor de processamento IA.
// Modos: paused (default) | on_demand | daily
// Ações: Limpar jobs presos, Correlacionar arquivos já extraídos, Disparar fila agora.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, Pause, Hand, Calendar, Trash2, Link2, Play, Loader2 } from "lucide-react";

type Mode = "paused" | "on_demand" | "daily";

export default function WorkerControlCard() {
  const [mode, setMode] = useState<Mode>("paused");
  const [enabled, setEnabled] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [queueAuto, setQueueAuto] = useState(0);
  const [queueManual, setQueueManual] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: cfg }, qAuto, qManual, fj] = await Promise.all([
      supabase.from("worker_config").select("mode, enabled, last_run_at").eq("id", "default").maybeSingle(),
      supabase.from("processing_queue").select("id", { count: "exact", head: true }).eq("status", "pending").eq("trigger_source", "auto"),
      supabase.from("processing_queue").select("id", { count: "exact", head: true }).eq("status", "pending").eq("trigger_source", "manual"),
      supabase.from("failed_jobs").select("id", { count: "exact", head: true }).is("resolved_at", null),
    ]);
    if (cfg) {
      setMode((cfg.mode as Mode) ?? "paused");
      setEnabled(!!cfg.enabled);
      setLastRunAt(cfg.last_run_at ?? null);
    }
    setQueueAuto(qAuto.count ?? 0);
    setQueueManual(qManual.count ?? 0);
    setFailedCount(fj.count ?? 0);
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeMode = async (m: Mode) => {
    setBusy("mode");
    try {
      const { error } = await supabase.rpc("set_worker_mode", { p_mode: m });
      if (error) throw error;
      toast.success(`Motor alterado para "${labelMode(m)}"`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao alterar modo");
    } finally { setBusy(null); }
  };

  const cleanup = async () => {
    setBusy("cleanup");
    try {
      const { data, error } = await supabase.rpc("cleanup_stuck_jobs", { p_stuck_minutes: 120 });
      if (error) throw error;
      const r = data as any;
      toast.success(`Limpeza: ${r.queue_cancelled} jobs cancelados · ${r.files_released} arquivos liberados · ${r.failed_purged} antigos removidos`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha na limpeza");
    } finally { setBusy(null); }
  };

  const correlate = async () => {
    setBusy("correlate");
    try {
      const { data, error } = await supabase.rpc("correlate_processed_files", { p_min_quality: 0.7 });
      if (error) throw error;
      const r = data as any;
      toast.success(`Correlação: ${r.files_correlated} arquivos marcados como processados · ${r.queue_removed} jobs removidos`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha na correlação");
    } finally { setBusy(null); }
  };

  const triggerNow = async () => {
    setBusy("trigger");
    try {
      const { data, error } = await supabase.functions.invoke("process-queue", {
        body: { batch_size: 10, concurrency: 3, force_manual: true },
      });
      if (error) throw error;
      toast.success(`Worker disparado · processados: ${(data as any)?.processed ?? 0}`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao disparar worker");
    } finally { setBusy(null); }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[hsl(217,91%,50%)]" />
            <h3 className="text-base font-bold">Motor de Processamento IA</h3>
            <Badge variant={enabled ? "default" : "secondary"} className="ml-1">
              {labelMode(mode)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Controle do consumo ativo de IA. Em <b>Pausado</b> nada é processado automaticamente.
            Em <b>Sob demanda</b> só rodam reprocessos disparados manualmente.
            Em <b>Diário</b> a fila inteira é executada uma vez por dia.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={!!busy}>
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ModeBtn current={mode} value="paused" icon={Pause} label="Pausado" onClick={() => changeMode("paused")} disabled={busy === "mode"} />
        <ModeBtn current={mode} value="on_demand" icon={Hand} label="Sob demanda" onClick={() => changeMode("on_demand")} disabled={busy === "mode"} />
        <ModeBtn current={mode} value="daily" icon={Calendar} label="Diário" onClick={() => changeMode("daily")} disabled={busy === "mode"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Fila auto" value={queueAuto} />
        <Stat label="Fila manual" value={queueManual} highlight />
        <Stat label="Falhas pendentes" value={failedCount} tone={failedCount > 0 ? "red" : "muted"} />
        <Stat label="Última execução" value={lastRunAt ? new Date(lastRunAt).toLocaleString("pt-BR") : "—"} small />
      </div>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
        <Button size="sm" variant="outline" onClick={cleanup} disabled={!!busy}>
          {busy === "cleanup" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
          Limpar jobs presos
        </Button>
        <Button size="sm" variant="outline" onClick={correlate} disabled={!!busy}>
          {busy === "correlate" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />}
          Correlacionar extrações
        </Button>
        <Button size="sm" onClick={triggerNow} disabled={!!busy}>
          {busy === "trigger" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          Disparar fila agora
        </Button>
      </div>
    </Card>
  );
}

function ModeBtn({ current, value, icon: Icon, label, onClick, disabled }: any) {
  const active = current === value;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
        active
          ? "bg-[hsl(217,91%,50%)] text-white border-[hsl(217,91%,50%)]"
          : "bg-white text-foreground border-border hover:bg-muted/40"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function Stat({ label, value, highlight, tone, small }: { label: string; value: any; highlight?: boolean; tone?: "red" | "muted"; small?: boolean }) {
  const color = tone === "red" ? "text-[hsl(0,84%,55%)]" : highlight ? "text-[hsl(217,91%,50%)]" : "text-foreground";
  return (
    <div className="border border-border rounded-lg px-3 py-2 bg-muted/20">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${small ? "text-xs" : "text-lg"} font-bold ${color}`}>{value}</div>
    </div>
  );
}

function labelMode(m: Mode) {
  return m === "paused" ? "Pausado" : m === "on_demand" ? "Sob demanda" : "Diário";
}
