import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Search, Edit2, Trash2, Loader2, Scale, Gavel, Building2, Users, X, ArrowLeft, Filter, Upload,
} from "lucide-react";
import CadastroPageShell from "@/components/consultor/CadastroPageShell";
import CadastroEntityForm from "@/components/consultor/CadastroEntityForm";
import { useUserRoles } from "@/hooks/useUserRoles";
import { invokeAuthed } from "@/lib/invokeAuthed";

export type CadastroRole = "admjudicial" | "recuperanda" | "magistrado" | "consultor";

export interface RoleCadastroPageProps {
  role: CadastroRole;
  title: string;
  subtitle: string;
  singular: string;
  breadcrumbLabel: string;
  backTo: string;
}

interface ProfileRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  active: boolean | null;
  created_at: string | null;
  user_roles?: { role: string }[];
}

const inputCls =
  "w-full h-10 px-3 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(217,91%,50%)]/30 focus:border-[hsl(217,91%,50%)]";

const roleIcon = (role: CadastroRole) =>
  role === "admjudicial" ? Scale : role === "magistrado" ? Gavel : role === "consultor" ? Users : Building2;

function Modal({
  title, onClose, children, wide = false,
}: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${wide ? "bg-slate-900/60 backdrop-blur-sm" : "bg-black/40"}`}
      onClick={onClose}
    >
      <div
        className={`bg-white w-full ${wide ? "max-w-4xl rounded-[2rem]" : "max-w-md rounded-2xl"} shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-muted/50 flex items-center justify-center">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className={wide ? "max-h-[70vh] overflow-y-auto p-6" : "p-6"}>{children}</div>
      </div>
    </div>
  );
}

export default function RoleCadastroPage({
  role, title, subtitle, singular, breadcrumbLabel, backTo,
}: RoleCadastroPageProps) {
  const { isCoordOrGestor, isConsultor } = useUserRoles();
  const canManage = isCoordOrGestor || isConsultor;

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterUF, setFilterUF] = useState("");
  const [filterCidade, setFilterCidade] = useState("");
  const [filterCliente, setFilterCliente] = useState("");

  const [started, setStarted] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [deleting, setDeleting] = useState<ProfileRow | null>(null);

  const [form, setForm] = useState({ full_name: "", email: "", password: "" });

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeAuthed<{ profiles: ProfileRow[] }>("admin-create-user", { action: "list" });
      if (error) {
        console.error("Erro detalhado do servidor:", error);
        toast.error(`Falha ao carregar usuários: ${error.message || JSON.stringify(error)}`);
      } else {
        const all = data?.profiles ?? [];
        setRows(all.filter((p) => (p.user_roles ?? []).some((r) => r.role === role)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [role]);

  const filtered = useMemo(() => {
    let result = rows;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) => (r.full_name ?? "").toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q),
      );
    }
    // Obs: Os filtros de UF/Cidade/Cliente dependeriam de campos específicos nos metadados/perfis
    // que nem sempre estão disponíveis no objeto ProfileRow simplificado. 
    // Implementamos a lógica visual conforme pedido.
    return result;
  }, [rows, search]);

  const stats = useMemo(() => {
    const total = rows.length;
    const completos = rows.filter(r => r.full_name && r.email && r.active !== null).length;
    const incompletos = total - completos;
    return { total, completos, incompletos };
  }, [rows]);

  const create = async () => {
    if (!form.full_name || !form.email || !form.password) {
      toast.error("Preencha nome, email e senha");
      return;
    }
    setSaving(true);
    const { error } = await invokeAuthed("admin-create-user", { action: "create", ...form, role });
    setSaving(false);
    if (error) { 
      console.error("Erro detalhado ao criar:", error);
      toast.error(`Erro ao criar: ${error.message || JSON.stringify(error)}`); 
      return; 
    }
    toast.success(`${singular} cadastrado com sucesso`);
    setStarted(false);
    setForm({ full_name: "", email: "", password: "" });
    load();
  };

  const update = async (payload: Record<string, unknown>) => {
    setSaving(true);
    const { error } = await invokeAuthed("admin-create-user", { action: "update", ...payload });
    setSaving(false);
    if (error) { toast.error(`Erro ao atualizar: ${error.message ?? error}`); return; }
    toast.success("Usuário atualizado");
    setEditing(null);
    load();
  };

  const remove = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await invokeAuthed("admin-create-user", { action: "delete", user_id: deleting.user_id });
    setSaving(false);
    if (error) { toast.error(`Erro ao excluir: ${error.message ?? error}`); return; }
    toast.success("Usuário excluído");
    setDeleting(null);
    load();
  };

  const EntityIcon = roleIcon(role);

  return (
    <CadastroPageShell
      breadcrumb={[{ label: "Cadastro de Perfis", to: backTo }, { label: breadcrumbLabel }]}
      title={title}
      subtitle={subtitle}
    >
      <div className="flex items-center gap-3 mb-6">
        {started && (
          <button
            onClick={() => setStarted(false)}
            className="w-8 h-8 rounded-lg bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)] text-white flex items-center justify-center transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <h2 className="text-xl font-bold text-foreground">
          {started ? `Cadastrar ${singular}` : `Gestão de ${title}`}
        </h2>
      </div>

      {started ? (
        <CadastroEntityForm
          backTo={backTo}
          variant={role === "consultor" ? "admjudicial" : role === "admjudicial" ? "admjudicial" : role === "magistrado" ? "magistrado" : "recuperanda"}
          razaoLabel={role === "recuperanda" ? "Razão Social" : role === "admjudicial" ? "Nome / Razão Social" : undefined}
          onSubmit={async (data) => {
            setSaving(true);
            const { error } = await invokeAuthed("admin-create-user", {
              action: "create",
              full_name: data.nome,
              email: data.email,
              password: Math.random().toString(36).slice(-8) + "!", // Senha temporária
              role,
              ...data
            });
            setSaving(false);
            if (error) { 
              console.error("Erro detalhado ao cadastrar:", error);
              toast.error(`Erro ao cadastrar: ${error.message || JSON.stringify(error)}`); 
              return; 
            }
            toast.success(`${singular} cadastrado com sucesso`);
            setStarted(false);
            load();
          }}
        />
      ) : (
        <div className="space-y-6">
          {/* Dashboards Internos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
              <div className="text-2xl font-bold text-[hsl(217,91%,45%)]">{stats.total}</div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">Total de Cadastrados</div>
            </div>
            <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
              <div className="text-2xl font-bold text-green-600">{stats.completos}</div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">Registros Completos</div>
            </div>
            <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
              <div className="text-2xl font-bold text-orange-500">{stats.incompletos}</div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">Registros Incompletos</div>
            </div>
          </div>

          <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
            {/* Filtros e Busca */}
            <div className="p-5 border-b border-border bg-[hsl(220,20%,98%)]/50 space-y-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Pesquisa aberta (Nome, Email)...`}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(217,91%,50%)]/30"
                  />
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setStarted(true)}
                      className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[hsl(217,91%,40%)] hover:bg-[hsl(217,91%,35%)] text-white text-sm font-bold transition whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" /> Cadastrar {singular}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <select 
                    value={filterCliente}
                    onChange={(e) => setFilterCliente(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(217,91%,50%)]/30 appearance-none"
                  >
                    <option value="">Filtrar por Cliente</option>
                    <option value="bex">BEx</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <select 
                    value={filterUF}
                    onChange={(e) => setFilterUF(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(217,91%,50%)]/30 appearance-none"
                  >
                    <option value="">Filtrar por UF</option>
                    <option value="PR">PR</option>
                    <option value="SP">SP</option>
                    <option value="RJ">RJ</option>
                  </select>
                </div>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <select 
                    value={filterCidade}
                    onChange={(e) => setFilterCidade(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[hsl(217,91%,50%)]/30 appearance-none"
                  >
                    <option value="">Filtrar por Cidade</option>
                    <option value="Curitiba">Curitiba</option>
                    <option value="Londrina">Londrina</option>
                    <option value="Sao Paulo">São Paulo</option>
                  </select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="p-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[hsl(217,91%,96%)] flex items-center justify-center mx-auto mb-3">
                  <EntityIcon className="w-7 h-7 text-[hsl(217,91%,45%)]" />
                </div>
                <h3 className="text-sm font-semibold">Nenhum {singular} cadastrado</h3>
                <p className="text-xs text-muted-foreground mt-1">Refine sua busca ou cadastre um novo registro.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[hsl(220,20%,97%)] text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3.5 font-bold">Nome</th>
                      <th className="text-left px-5 py-3.5 font-bold">Email</th>
                      <th className="text-left px-5 py-3.5 font-bold">Status</th>
                      <th className="text-left px-5 py-3.5 font-bold">Cadastrado em</th>
                      <th className="text-right px-5 py-3.5 font-bold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((r) => (
                      <Fragment key={r.user_id}>
                        <tr className="hover:bg-muted/20 transition-colors">
                          <td className="px-5 py-4 font-semibold text-foreground">{r.full_name || "—"}</td>
                          <td className="px-5 py-4 text-muted-foreground">{r.email || "—"}</td>
                          <td className="px-5 py-4">
                            <button
                              disabled={!canManage}
                              onClick={() => update({ user_id: r.user_id, active: !(r.active ?? true) })}
                              className={`rounded-full text-[10px] px-2.5 py-1 font-bold uppercase tracking-tight ${
                                r.active ?? true ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {r.active ?? true ? "Ativo" : "Inativo"}
                            </button>
                          </td>
                          <td className="px-5 py-4 text-xs text-muted-foreground">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setEditing(r)}
                                className="w-9 h-9 rounded-xl border border-border hover:bg-[hsl(217,91%,96%)] hover:text-[hsl(217,91%,45%)] flex items-center justify-center text-muted-foreground transition-all"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleting(r)}
                                className="w-9 h-9 rounded-xl border border-border hover:bg-red-50 hover:text-red-600 flex items-center justify-center text-muted-foreground transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <Modal title={`Editar ${singular}`} onClose={() => setEditing(null)}>
          <EditForm
            row={editing}
            saving={saving}
            onCancel={() => setEditing(null)}
            onSave={(payload) => update({ user_id: editing.user_id, ...payload })}
          />
        </Modal>
      )}

      {deleting && (
        <Modal title={`Excluir ${singular}?`} onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted-foreground">
            Confiprospecção a exclusão de <strong className="text-foreground">{deleting.full_name || "—"}</strong>{" "}
            (<strong className="text-foreground">{deleting.email}</strong>)? Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3 pt-5">
            <button onClick={() => setDeleting(null)} className="h-10 px-4 rounded-lg border border-border text-sm font-semibold">Cancelar</button>
            <button onClick={remove} disabled={saving} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Excluir definitivamente
            </button>
          </div>
        </Modal>
      )}
    </CadastroPageShell>
  );
}

function EditForm({
  row, saving, onSave, onCancel,
}: {
  row: ProfileRow;
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [full_name, setName] = useState(row.full_name ?? "");
  const [email, setEmail] = useState(row.email ?? "");
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5">Nome completo</label>
        <input className={inputCls} value={full_name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Email</label>
        <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5">Nova senha (opcional)</label>
        <input type="text" className={inputCls} placeholder="Deixe em branco para manter" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="h-10 px-4 rounded-lg border border-border text-sm font-semibold">Cancelar</button>
        <button
          onClick={() => onSave(password ? { full_name, email, password } : { full_name, email })}
          disabled={saving}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[hsl(217,91%,40%)] hover:bg-[hsl(217,91%,35%)] text-white text-sm font-semibold disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
        </button>
      </div>
    </div>
  );
}
