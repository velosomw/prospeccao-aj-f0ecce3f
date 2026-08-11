// Painel de versionamento (snapshots) do Balancete + BS + DRE para um mês.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { History, Camera, Undo2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useBalanceteSnapshots } from "@/hooks/useBalanceteSnapshots";

interface Props {
  companyId: string | null;
  ano: number;
  mes: number;
  /** chamado após restore para o pai recarregar dados das abas */
  onRestored?: () => void;
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function BalanceteVersoesCard({ companyId, ano, mes, onRestored }: Props) {
  const { snapshots, loading, busy, create, restore } = useBalanceteSnapshots(companyId, ano, mes);
  const [motivo, setMotivo] = useState("");
  const [restoreMotivo, setRestoreMotivo] = useState("");

  const handleCreate = async () => {
    try {
      const res = await create(motivo || undefined);
      if (res?.snapshot) {
        toast.success(`Snapshot v${res.snapshot.versao} criado`, {
          description: `${res.snapshot.rows_balancete} contas · ${res.snapshot.rows_bs} BS · ${res.snapshot.rows_dre} DRE`,
        });
        setMotivo("");
      }
    } catch (e: any) {
      toast.error("Falha ao criar snapshot", { description: e?.message });
    }
  };

  const handleRestore = async (id: string, versao: number) => {
    try {
      const res = await restore(id, restoreMotivo || undefined);
      if (res?.ok) {
        toast.success(`Rollback aplicado (v${versao})`, {
          description: `Snapshot de segurança v${res.safety_snapshot_versao} criado antes do rollback.`,
        });
        setRestoreMotivo("");
        onRestored?.();
      }
    } catch (e: any) {
      toast.error("Falha no rollback", { description: e?.message });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="w-4 h-4 text-[hsl(217,91%,50%)]" />
          Versionamento — {String(mes).padStart(2,"0")}/{ano}
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {snapshots.length} {snapshots.length === 1 ? "versão" : "versões"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Criar novo snapshot */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Motivo do snapshot (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="text-xs h-9"
          />
          <Button size="sm" className="gap-1.5" disabled={busy || !companyId} onClick={handleCreate}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            Criar snapshot
          </Button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" /> Carregando histórico…
          </div>
        ) : snapshots.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Nenhum snapshot ainda. Crie o primeiro para habilitar rollback.
          </div>
        ) : (
          <ScrollArea className="h-64 border rounded-md">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-left">
                  <th className="py-1.5 px-2 font-semibold">Versão</th>
                  <th className="py-1.5 px-2 font-semibold">Data</th>
                  <th className="py-1.5 px-2 font-semibold">Origem</th>
                  <th className="py-1.5 px-2 font-semibold">Linhas</th>
                  <th className="py-1.5 px-2 font-semibold">Motivo</th>
                  <th className="py-1.5 px-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-1.5 px-2 font-semibold tabular-nums">v{s.versao}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">{fmtDate(s.created_at)}</td>
                    <td className="py-1.5 px-2">
                      <Badge variant="outline" className="text-[9px]">
                        {s.origem || "manual"}
                      </Badge>
                      {s.restored_from && (
                        <Badge variant="secondary" className="ml-1 text-[9px]">
                          <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />pré-rollback
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 px-2 tabular-nums text-muted-foreground">
                      {s.rows_balancete}/{s.rows_bs}/{s.rows_dre}
                    </td>
                    <td className="py-1.5 px-2 text-muted-foreground max-w-[200px] truncate" title={s.motivo || ""}>
                      {s.motivo || "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1" disabled={busy}>
                            <Undo2 className="w-3 h-3" /> Restaurar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restaurar versão v{s.versao}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Os dados atuais de Balancete, BS e DRE de <b>{String(mes).padStart(2,"0")}/{ano}</b> serão substituídos pelos dados deste snapshot.
                              Um snapshot de segurança será criado automaticamente antes da operação.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <Input
                            placeholder="Motivo do rollback (opcional)"
                            value={restoreMotivo}
                            onChange={(e) => setRestoreMotivo(e.target.value)}
                            className="text-xs"
                          />
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRestore(s.id, s.versao)}>
                              Confiprospecçãor rollback
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
