import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { updateCompany, deleteCompany, type Company } from "@/services/companiesService";

interface Props {
  company: Company | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function EditCompanyDialog({ company, open, onOpenChange, onSaved, onDeleted }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<Company>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (company) setForm({ ...company });
  }, [company]);

  if (!company) return null;

  const set = (k: keyof Company, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCompany(company.id, {
        name: form.name || company.name,
        cnpj: form.cnpj || undefined,
        rma_id: form.rma_id || undefined,
        sector: form.sector || undefined,
        cnae: form.cnae || undefined,
        city: form.city || undefined,
        uf: form.uf || undefined,
        zip: form.zip || undefined,
        address: form.address || undefined,
        contact_name: form.contact_name || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        phone_fixed: form.phone_fixed || undefined,
        notes: form.notes || undefined,
      });
      toast({ title: "Empresa atualizada", description: "Dados salvos com sucesso." });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCompany(company.id);
      toast({ title: "RMA excluído", description: `${company.name} foi removido.` });
      onDeleted();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Empresa / RMA</DialogTitle>
          <DialogDescription>Ajuste os dados de cadastro ou exclua o RMA.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
          <div className="md:col-span-2">
            <Label>Nome da empresa *</Label>
            <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label>ID RMA</Label>
            <Input value={form.rma_id || ""} onChange={(e) => set("rma_id", e.target.value)} />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input value={form.cnpj || ""} onChange={(e) => set("cnpj", e.target.value)} />
          </div>
          <div>
            <Label>Setor</Label>
            <Input value={form.sector || ""} onChange={(e) => set("sector", e.target.value)} />
          </div>
          <div>
            <Label>CNAE</Label>
            <Input value={form.cnae || ""} onChange={(e) => set("cnae", e.target.value)} />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label>UF</Label>
            <Input value={form.uf || ""} onChange={(e) => set("uf", e.target.value)} maxLength={2} />
          </div>
          <div>
            <Label>CEP</Label>
            <Input value={form.zip || ""} onChange={(e) => set("zip", e.target.value)} />
          </div>
          <div>
            <Label>Endereço</Label>
            <Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div>
            <Label>Contato</Label>
            <Input value={form.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label>Telefone celular</Label>
            <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <Label>Telefone fixo</Label>
            <Input value={form.phone_fixed || ""} onChange={(e) => set("phone_fixed", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleting || saving}>
                <Trash2 className="w-4 h-4" /> Excluir RMA
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {company.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. O RMA e os dados de cadastro serão removidos permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
