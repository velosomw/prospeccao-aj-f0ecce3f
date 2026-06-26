import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Clock, Layers } from "lucide-react";

interface BatchConfig {
  enabled: boolean;
  threshold_size_mb: number;
  threshold_pages: number;
  default_eta_hours: number;
  max_eta_hours: number;
  off_peak_start_hour: number;
  off_peak_end_hour: number;
  off_peak_timezone: string;
  max_batch_size: number;
  max_concurrent_submits: number;
  schedule_in_off_peak: boolean;
}

const DEFAULTS: BatchConfig = {
  enabled: true,
  threshold_size_mb: 10,
  threshold_pages: 50,
  default_eta_hours: 6,
  max_eta_hours: 24,
  off_peak_start_hour: 22,
  off_peak_end_hour: 6,
  off_peak_timezone: "America/Sao_Paulo",
  max_batch_size: 20,
  max_concurrent_submits: 5,
  schedule_in_off_peak: true,
};

export default function BatchProcessingConfigCard() {
  const [cfg, setCfg] = useState<BatchConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("batch_processing_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (data) setCfg({ ...DEFAULTS, ...(data as Partial<BatchConfig>) });
      setLoading(false);
    })();
  }, []);

  const upd = <K extends keyof BatchConfig>(k: K, v: BatchConfig[K]) =>
    setCfg((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("batch_processing_config")
      .update({
        enabled: cfg.enabled,
        threshold_size_mb: cfg.threshold_size_mb,
        threshold_pages: cfg.threshold_pages,
        default_eta_hours: cfg.default_eta_hours,
        max_eta_hours: cfg.max_eta_hours,
        off_peak_start_hour: cfg.off_peak_start_hour,
        off_peak_end_hour: cfg.off_peak_end_hour,
        off_peak_timezone: cfg.off_peak_timezone,
        max_batch_size: cfg.max_batch_size,
        max_concurrent_submits: cfg.max_concurrent_submits,
        schedule_in_off_peak: cfg.schedule_in_off_peak,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configurações salvas", description: "Aplicadas a novos arquivos enfileirados." });
    }
  }

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando configurações de batch...
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-semibold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Processamento em Lote (Batch)
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Arquivos grandes (acima dos limites) entram na fila batch e são processados na janela mais barata.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="batch-enabled" className="text-xs">Ativo</Label>
          <Switch id="batch-enabled" checked={cfg.enabled} onCheckedChange={(v) => upd("enabled", v)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tamanho mínimo p/ batch (MB)" value={cfg.threshold_size_mb}
          onChange={(v) => upd("threshold_size_mb", v)} min={1} />
        <Field label="Páginas mínimas p/ batch" value={cfg.threshold_pages}
          onChange={(v) => upd("threshold_pages", v)} min={1} />
        <Field label="Tamanho máximo do batch (jobs/ciclo)" value={cfg.max_batch_size}
          onChange={(v) => upd("max_batch_size", v)} min={1} max={200} />
        <Field label="Submissões simultâneas (máx.)" value={cfg.max_concurrent_submits}
          onChange={(v) => upd("max_concurrent_submits", v)} min={1} max={50} />
        <Field label="ETA padrão (horas)" value={cfg.default_eta_hours}
          onChange={(v) => upd("default_eta_hours", v)} min={1} max={48} />
        <Field label="ETA máximo (horas)" value={cfg.max_eta_hours}
          onChange={(v) => upd("max_eta_hours", v)} min={1} max={72} />
      </div>

      <div className="border-t border-border pt-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h5 className="font-medium text-foreground text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Janela de horário mais barato
            </h5>
            <p className="text-xs text-muted-foreground mt-0.5">
              Novos jobs ficam aguardando até o início desta janela (cruza meia-noite se início &gt; fim).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="off-peak" className="text-xs">Agendar</Label>
            <Switch id="off-peak" checked={cfg.schedule_in_off_peak}
              onCheckedChange={(v) => upd("schedule_in_off_peak", v)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Início (hora local 0–23)" value={cfg.off_peak_start_hour}
            onChange={(v) => upd("off_peak_start_hour", Math.max(0, Math.min(23, v)))} min={0} max={23} />
          <Field label="Fim (hora local 0–23)" value={cfg.off_peak_end_hour}
            onChange={(v) => upd("off_peak_end_hour", Math.max(0, Math.min(23, v)))} min={0} max={23} />
          <div className="space-y-1.5">
            <Label className="text-xs">Fuso horário</Label>
            <Input value={cfg.off_peak_timezone}
              onChange={(e) => upd("off_peak_timezone", e.target.value)}
              placeholder="America/Sao_Paulo" />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}
          className="bg-[hsl(258,90%,66%)] hover:bg-[hsl(258,80%,55%)] text-white">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10))} />
    </div>
  );
}
