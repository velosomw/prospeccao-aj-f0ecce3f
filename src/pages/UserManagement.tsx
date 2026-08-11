import { invokeAuthed } from "@/lib/invokeAuthed";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PlatformLayout from "@/components/PlatformLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users, UserCheck, UserX, Search, Plus, Edit, Trash2, Eye, EyeOff,
  ShieldAlert, ArrowLeft, Ban, Building2, Link2, X, ArrowRightLeft
} from "lucide-react";
import {
  listCompanies,
  listCompanyConsultants,
  assignCompanyToConsultant,
  unassignCompanyFromConsultant,
  type Company,
  type CompanyConsultant,
} from "@/services/companiesService";

type UserProfile = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  user_roles: { role: string }[];
};

const roleLabels: Record<string, string> = {
  coordenador: "Coordenador",
  consultor: "Consultor",
  magistrado: "Magistrado",
  recuperanda: "Recuperanda",
  admjudicial: "Admjudicial",
  gestor_ia: "Gestor IA",
};

const UserManagement = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const callerType = searchParams.get("caller") || "gestor";

  const allowedRoles = callerType === "gestor"
    ? [
        { value: "coordenador", label: "Coordenador" },
        { value: "admjudicial", label: "Admjudicial" },
      ]
    : callerType === "admjudicial"
    ? [{ value: "recuperanda", label: "Recuperanda" }]
    : [
        { value: "consultor", label: "Consultor" },
        { value: "magistrado", label: "Magistrado" },
        { value: "recuperanda", label: "Recuperanda" },
        { value: "admjudicial", label: "Admjudicial" },
      ];

  const pageTitle = callerType === "gestor"
    ? "Gerenciar Coordenadores e Admjudiciais"
    : callerType === "admjudicial"
    ? "Gerenciar Recuperandas Vinculadas"
    : "Gerenciar Usuários Operacionais";

  const backPath = callerType === "gestor"
    ? "/gestor-ia"
    : callerType === "admjudicial"
    ? "/admjudicial"
    : "/dashboard";

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({ email: "", password: "", full_name: "", role: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Prospeccao assignment state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [assignments, setAssignments] = useState<CompanyConsultant[]>([]);
  const [selectedConsultant, setSelectedConsultant] = useState<UserProfile | null>(null);
  const [editAssignSelected, setEditAssignSelected] = useState<Set<string>>(new Set());
  const [savingAssign, setSavingAssign] = useState(false);

  useEffect(() => {
    loadUsers();
    loadRmaData();
  }, []);

  const loadRmaData = async () => {
    try {
      const [cs, asg] = await Promise.all([listCompanies(), listCompanyConsultants()]);
      setCompanies(cs);
      setAssignments(asg);
    } catch (err: any) {
      // silencioso – usuário pode não ter permissão
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
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
      toast.success(user.active ? "Acesso suspenso" : "Acesso reativado");
      loadUsers();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await invokeAuthed("admin-create-user", {
        body: { action: "delete", user_id: deleteTarget.user_id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success("Usuário excluído com sucesso");
      setDeleteTarget(null);
      loadUsers();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({ email: user.email, password: "", full_name: user.full_name, role: user.role });
    if (user.role === "consultor") {
      const ids = assignments
        .filter((a) => a.consultant_user_id === user.user_id)
        .map((a) => a.company_id);
      setEditAssignSelected(new Set(ids));
    } else {
      setEditAssignSelected(new Set());
    }
    setShowForm(true);
  };

  const startCreate = () => {
    setEditingUser(null);
    setFormData({ email: "", password: "", full_name: "", role: allowedRoles[0]?.value || "" });
    setEditAssignSelected(new Set());
    setShowForm(true);
  };

  const companiesById = useMemo(() => {
    const m = new Map<string, Company>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const assignmentsByConsultant = useMemo(() => {
    const m = new Map<string, string[]>();
    assignments.forEach((a) => {
      const arr = m.get(a.consultant_user_id) || [];
      arr.push(a.company_id);
      m.set(a.consultant_user_id, arr);
    });
    return m;
  }, [assignments]);

  const matchesSearch = (u: UserProfile) =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase());

  const consultantIdsByCompanySearch = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return null;
    const matchingCompanyIds = new Set(
      companies
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.prospeccao_id || "").toLowerCase().includes(q) ||
            (c.cnpj || "").toLowerCase().includes(q)
        )
        .map((c) => c.id)
    );
    const ids = new Set<string>();
    assignments.forEach((a) => {
      if (matchingCompanyIds.has(a.company_id)) ids.add(a.consultant_user_id);
    });
    return ids;
  }, [companySearch, companies, assignments]);

  const filteredUsers = users.filter((u) => {
    if (!matchesSearch(u)) return false;
    if (consultantIdsByCompanySearch) {
      return u.role === "consultor" && consultantIdsByCompanySearch.has(u.user_id);
    }
    return true;
  });

  const selectedConsultantProspeccoes = useMemo(() => {
    if (!selectedConsultant) return [] as Company[];
    const ids = assignmentsByConsultant.get(selectedConsultant.user_id) || [];
    return ids.map((id) => companiesById.get(id)).filter(Boolean) as Company[];
  }, [selectedConsultant, assignmentsByConsultant, companiesById]);

  const saveAssignments = async () => {
    if (!editingUser) return;
    setSavingAssign(true);
    try {
      const currentIds = new Set(
        assignments.filter((a) => a.consultant_user_id === editingUser.user_id).map((a) => a.company_id)
      );
      const toAdd = [...editAssignSelected].filter((id) => !currentIds.has(id));
      const toRemove = [...currentIds].filter((id) => !editAssignSelected.has(id));

      // Mover Prospeccao: ao adicionar, remove esse Prospeccao de outros consultores
      for (const cid of toAdd) {
        await assignCompanyToConsultant(cid, editingUser.user_id, { moveFromOthers: true });
      }
      for (const cid of toRemove) {
        await unassignCompanyFromConsultant(cid, editingUser.user_id);
      }
      await loadRmaData();
      toast.success("Vínculos de Prospeccao atualizados");
    } catch (err: any) {
      toast.error("Erro ao atualizar vínculos: " + err.message);
    } finally {
      setSavingAssign(false);
    }
  };

  const totalUsers = filteredUsers.length;
  const activeUsers = filteredUsers.filter((u) => u.active).length;
  const inactiveUsers = filteredUsers.filter((u) => !u.active).length;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(backPath)}
              className="w-8 h-8 rounded-md bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white flex items-center justify-center transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
              <p className="text-sm text-muted-foreground">Gerencie os usuários cadastrados na plataforma</p>
            </div>
          </div>
          <Button className="bg-primary hover:bg-primary/90 gap-1.5" onClick={startCreate}>
            <Plus className="w-4 h-4" /> Novo Consultor
          </Button>
        </div>

        {/* Dashboard Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/50">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[hsl(217,91%,50%)]/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-[hsl(217,91%,50%)]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Cadastrados</p>
                <p className="text-3xl font-bold text-foreground">{totalUsers}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[hsl(152,70%,45%)]/10 flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-[hsl(152,70%,45%)]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Ativos</p>
                <p className="text-3xl font-bold text-[hsl(152,70%,45%)]">{activeUsers}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[hsl(0,70%,55%)]/10 flex items-center justify-center">
                <UserX className="w-6 h-6 text-[hsl(0,70%,55%)]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Inativos</p>
                <p className="text-3xl font-bold text-[hsl(0,70%,55%)]">{inactiveUsers}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por empresa Prospeccao AJ (nome, ID Prospeccao AJ, CNPJ)..."
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {companySearch && (
              <button
                onClick={() => setCompanySearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Painel inline: Prospeccoes do consultor selecionado */}
        {selectedConsultant && (
          <Card className="border-[hsl(217,91%,50%)]/30 bg-[hsl(217,91%,50%)]/5">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                  <h3 className="font-semibold text-foreground">
                    Prospeccoes de {selectedConsultant.full_name}
                  </h3>
                  <Badge className="bg-[hsl(217,91%,50%)] text-white">
                    {selectedConsultantProspeccoes.length}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(selectedConsultant)}>
                    <Edit className="w-3.5 h-3.5 mr-1.5" /> Gerenciar vínculos
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedConsultant(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {selectedConsultantProspeccoes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Nenhum Prospeccao associado. Clique em "Gerenciar vínculos" para atribuir.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {selectedConsultantProspeccoes.map((c) => (
                    <div
                      key={c.id}
                      className="bg-card border border-border rounded-lg p-3 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {c.prospeccao_id && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {c.prospeccao_id}
                            </Badge>
                          )}
                          {c.cnpj && (
                            <span className="text-[11px] text-muted-foreground">{c.cnpj}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        title="Remover vínculo"
                        onClick={async () => {
                          await unassignCompanyFromConsultant(c.id, selectedConsultant.user_id);
                          await loadRmaData();
                          toast.success("Prospeccao desvinculado");
                        }}
                      >
                        <X className="w-3.5 h-3.5 text-[hsl(0,70%,55%)]" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando usuários...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado. Clique em 'Novo Usuário' para começar."}
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">E-mail</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Perfil</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Último Acesso</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const isConsultor = user.role === "consultor";
                  const prospeccaoCount = (assignmentsByConsultant.get(user.user_id) || []).length;
                  const isSelected = selectedConsultant?.user_id === user.user_id;
                  return (
                  <tr
                    key={user.id}
                    onClick={() => isConsultor && setSelectedConsultant(isSelected ? null : user)}
                    className={`border-t transition-colors ${
                      isConsultor ? "cursor-pointer" : ""
                    } ${isSelected ? "bg-[hsl(217,91%,50%)]/10" : "hover:bg-muted/30"}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{user.full_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {roleLabels[user.role] || user.role}
                        </Badge>
                        {isConsultor && prospeccaoCount > 0 && (
                          <Badge className="text-[10px] bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] border-[hsl(217,91%,50%)]/30 border">
                            <Building2 className="w-3 h-3 mr-1" /> {prospeccaoCount} Prospeccao{prospeccaoCount > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        user.active
                          ? "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]"
                          : "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]"
                      }`}>
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                      {formatDate(user.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={user.active ? "Suspender acesso" : "Reativar acesso"}
                          onClick={() => toggleActive(user)}
                        >
                          <Ban className={`w-4 h-4 ${user.active ? "text-[hsl(38,90%,55%)]" : "text-[hsl(152,70%,45%)]"}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar dados"
                          onClick={() => startEdit(user)}
                        >
                          <Edit className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Excluir usuário"
                          onClick={() => setDeleteTarget(user)}
                        >
                          <Trash2 className="w-4 h-4 text-[hsl(0,70%,55%)]" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditingUser(null); }}>
        <DialogContent className={editingUser?.role === "consultor" ? "max-w-2xl max-h-[90vh] overflow-y-auto" : "max-w-lg"}>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuário" : "Cadastrar Novo Usuário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                <SelectContent>
                  {allowedRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editingUser && formData.role === "consultor" && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm flex items-center gap-1.5">
                      <Link2 className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                      Prospeccoes vinculados a este consultor
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Marque para vincular. Ao vincular, o Prospeccao é movido automaticamente caso esteja com outro consultor.
                    </p>
                  </div>
                  <Badge className="bg-[hsl(217,91%,50%)] text-white">
                    {editAssignSelected.size}
                  </Badge>
                </div>
                <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
                  {companies.length === 0 && (
                    <p className="text-sm text-muted-foreground p-4 text-center">
                      Nenhuma empresa Prospeccao cadastrada.
                    </p>
                  )}
                  {companies.map((c) => {
                    const checked = editAssignSelected.has(c.id);
                    const currentOwner = assignments.find(
                      (a) => a.company_id === c.id && a.consultant_user_id !== editingUser.user_id
                    );
                    const ownerUser = currentOwner
                      ? users.find((u) => u.user_id === currentOwner.consultant_user_id)
                      : null;
                    return (
                      <label
                        key={c.id}
                        className="flex items-start gap-3 p-3 hover:bg-muted/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setEditAssignSelected((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(c.id);
                              else next.delete(c.id);
                              return next;
                            });
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{c.name}</span>
                            {c.prospeccao_id && (
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {c.prospeccao_id}
                              </Badge>
                            )}
                          </div>
                          {ownerUser && !checked && (
                            <p className="text-[11px] text-[hsl(38,90%,45%)] mt-1 flex items-center gap-1">
                              <ArrowRightLeft className="w-3 h-3" />
                              Atualmente com: {ownerUser.full_name}
                            </p>
                          )}
                          {ownerUser && checked && (
                            <p className="text-[11px] text-[hsl(217,91%,50%)] mt-1 flex items-center gap-1">
                              <ArrowRightLeft className="w-3 h-3" />
                              Será movido de: {ownerUser.full_name}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveAssignments}
                  disabled={savingAssign}
                  className="w-full"
                >
                  {savingAssign ? "Aplicando vínculos..." : "Aplicar vínculos de Prospeccao"}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingUser(null); }}>
              Cancelar
            </Button>
            <Button onClick={editingUser ? handleUpdate : handleCreate} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Salvando..." : editingUser ? "Salvar Alterações" : "Cadastrar Consultor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmacaotion Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[hsl(0,70%,55%)]">
              <ShieldAlert className="w-5 h-5" /> Confirmacaor Exclusão
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deseja realmente excluir o usuário <strong className="text-foreground">{deleteTarget?.full_name}</strong> ({deleteTarget?.email})?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Excluir Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformLayout>
  );
};

export default UserManagement;
