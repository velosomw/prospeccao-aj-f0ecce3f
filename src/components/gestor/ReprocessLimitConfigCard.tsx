import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RotateCw, Loader2 } from "lucide-react";

export default function ReprocessLimitConfigCard() {
  const [value, setValue] = useState<number>(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("worker_config")
      .select("max_reprocess_attempts")
      .eq("id", "default")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.max_reprocess_attempts != null) setValue(Number(data.max_reprocess_attempts));
        setLoading(false);
      });
  }, []);

  async function save() {
    if (!Number.isFinite(value) || value < 1 || value > 20) {
      toast.error("Informe um número entre 1 e 20.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("worker_config")
      .update({ max_reprocess_attempts: value, updated_at: new Date().toISOString() })
      .eq("id", "default");
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Limite de reprocessamento atualizado.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RotateCw className="w-4 h-4 text-[hsl(217,91%,50%)]" />
          Limite de Reprocessamento Manual
        </CardTitle>
        <CardDescription>
          Define quantas vezes um mesmo arquivo pode ser reenviado ao pipeline (OCR + IA) por usuários.
          Gestor IA não é limitado.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-end gap-3">
        <div className="flex-1 max-w-[180px]">
          <Label className="text-xs">Tentativas máximas por arquivo</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={loading ? "" : value}
            onChange={(e) => setValue(Number(e.target.value))}
            disabled={loading || saving}
          />
        </div>
        <Button onClick={save} disabled={loading || saving} className="bg-[hsl(217,91%,50%)] text-white hover:opacity-90">
          {saving ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando...</> : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}
