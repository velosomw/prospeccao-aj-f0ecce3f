import { invokeAuthed } from "@/lib/invokeAuthed";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Edit, Users, Search, Eye, EyeOff } from "lucide-react";

type UserProfile = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  active: boolean;
  created_at: string;
  user_roles: { role: string }[];
};

interface UserManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowedRoles: { value: string; label: string }[];
  title: string;
}

const roleLabels: Record<string, string> = {
  coordenador: "Coordenador",
  consultor: "Consultor",
  magistrado: "Magistrado",
  recuperanda: "Empresa de Prospecção",
  admjudicial: "Admjudicial",
  gestor_ia: "Gestor IA",
};

const UserManagementDialog = ({ open, onOpenChange, allowedRoles, title }: UserManagementDialogProps) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({ email: "", password: "", full_name: "", role: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) loadUsers();
  }, [open]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await invokeAuthed("admin-create-user", {
        body: { action: "list" },
      });

      if (error) throw error;
      setUsers(data.profiles || []);
    } catch (err: any) {
      toast.error("Erro ao carregar usuários: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.email || !formData.password || !formData.full_name || !formData.role) {
      toast.error("Preencha todos os campos");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await invokeAuthed("admin-create-user", {
        body: { action: "create", ...formData },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success("Usuário cadastrado com sucesso!");
      setShowForm(false);
      setFormData({ email: "", password: "", full_name: "", role: "" });
      loadUsers();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const { data, error } = await invokeAuthed("admin-create-user", {
        body: {
          action: "update",
          user_id: editingUser.user_id,
          full_name: formData.full_name,
          role: formData.role,
          active: editingUser.active,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success("Usuário atualizado!");
      setEditingUser(null);
      setShowForm(false);
      loadUsers();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: UserProfile) => {
    try {
      const { data, error } = await invokeAuthed("admin-create-user", {
        body: { action: "update", user_id: user.user_id, active: !user.active },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success(user.active ? "Usuário desativado" : "Usuário ativado");
      loadUsers();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: "",
      full_name: user.full_name,
      role: user.role,
    });
    setShowForm(true);
  };

  const startCreate = () => {
    setEditingUser(null);
    setFormData({ email: "", password: "", full_name: "", role: allowedRoles[0]?.value || "" });
    setShowForm(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> {title}
          </DialogTitle>
        </DialogHeader>

        {!showForm ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou e-mail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90" onClick={startCreate}>
                <Plus className="w-4 h-4" /> Novo Usuário
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado. Clique em 'Novo Usuário' para começar."}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Nome</th>
                      <th className="text-left px-4 py-2 font-medium">E-mail</th>
                      <th className="text-left px-4 py-2 font-medium">Perfil</th>
                      <th className="text-center px-4 py-2 font-medium">Status</th>
                      <th className="text-center px-4 py-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-medium">{user.full_name || "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{user.email}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-xs">
                            {roleLabels[user.role] || user.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => toggleActive(user)}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                              user.active
                                ? "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]"
                                : "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]"
                            }`}
                          >
                            {user.active ? "Ativo" : "Inativo"}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(user)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="font-semibold">
              {editingUser ? "Editar Usuário" : "Cadastrar Novo Usuário"}
            </h3>

            <div className="space-y-3">
              <div>
                <Label className="text-sm">Nome Completo</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Nome completo do usuário"
                />
              </div>

              <div>
                <Label className="text-sm">E-mail</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@empresa.com.br"
                  disabled={!!editingUser}
                />
              </div>

              {!editingUser && (
                <div>
                  <Label className="text-sm">Senha</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Senha segura (mín. 8 caracteres)"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm">Perfil de Acesso</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                  <SelectContent>
                    {allowedRoles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingUser(null); }}>
                Cancelar
              </Button>
              <Button
                onClick={editingUser ? handleUpdate : handleCreate}
                disabled={saving}
                className="bg-primary hover:bg-primary/90"
              >
                {saving ? "Salvando..." : editingUser ? "Salvar Alterações" : "Cadastrar Usuário"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserManagementDialog;
