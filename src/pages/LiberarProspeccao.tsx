import { invokeAuthed } from "@/lib/invokeAuthed";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Send, Search, Trash2, Pause, Play, History as HistoryIcon,
  ShieldCheck, Calendar, Building2, UserCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import PlatformLayout from "@/components/PlatformLayout";
import RmaMovementHistory from "@/components/RmaMovementHistory";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { listCompanies, type Company } from "@/services/companiesService";
import {
  listReleases, createRelease, updateReleaseStatus, deleteRelease,
  monthLabel, statusLabel, type ProspeccaoRelease, type ReleaseRole, type ReleaseStatus,
} from "@/services/prospecçãoReleaseService";

type ProfileLite = { user_id: string; full_name: string; email: string; role: string; active: boolean };

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

const LiberarProspecção = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [releases, setReleases] = useState<ProspeccaoRelease[]>([]);
  const [loading, setLoading] = useState(true);

  // form
  const [companyId, setCompanyId] = useState("");
  const [year, setYear] = useState(String(currentYear));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [targetRole, setTargetRole] = useState<ReleaseRole>("magistrado");
  const [targetUserId, setTargetUserId] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [c, rels] = await Promise.all([listCompanies(), listReleases()]);
      setCompanies(c);
      setReleases(rels);

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.access_token) {
        const { data, error } = await invokeAuthed("admin-create-user", {
          body: { action: "list" },
        });
        if (!error) setProfiles(((data as any)?.profiles || []) as ProfileLite[]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const profilesById = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const companiesById = useMemo(() => {
    const m = new Map<string, Company>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const eligibleUsers = useMemo(
    () => profiles.filter((p) => p.role === targetRole && p.active),
    [profiles, targetRole]
  );

  const handleRelease = async () => {
    if (!companyId || !targetUserId) {
      toast({ title: "Preencha empresa e destinatário", variant: "destructive" });
      return;
    }
    try {
      await createRelease({
        company_id: companyId,
        year: Number(year),
        month: Number(month),
        released_to_user_id: targetUserId,
        released_to_role: targetRole,
        notes: notes || undefined,
      });
      toast({ title: "Prospecção AJ liberado com sucesso" });
      setNotes("");
      setTargetUserId("");
      load();
    } catch (e: any) {
      toast({ title: "Erro ao liberar Prospecção AJ", description: e.message, variant: "destructive" });
    }
  };

  const handleStatus = async (r: ProspeccaoRelease, status: ReleaseStatus) => {
    try {
      await updateReleaseStatus(r.id, status, r.company_id, r.released_to_user_id);
      toast({ title: `Liberação ${statusLabel[status].label.toLowerCase()}` });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar status", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (r: ProspeccaoRelease) => {
    if (!confirm("Remover esta liberação? Esta ação será registrada na trilha de auditoria.")) return;
    try {
      await deleteRelease(r.id, r.company_id, r.released_to_user_id);
      toast({ title: "Liberação removida" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    }
  };

  const filteredReleases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return releases;
    return releases.filter((r) => {
      const c = companiesById.get(r.company_id);
      const u = profilesById.get(r.released_to_user_id);
      return [c?.name, c?.prospecção_id, u?.full_name, u?.email, monthLabel(r.month), String(r.year)]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [releases, search, companiesById, profilesById]);

  const formatDateTime = (s: string) =>
    new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-8 h-8 rounded-md bg-[hsl(217,91%,50%)] text-white flex items-center justify-center hover:opacity-90"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-[hsl(217,91%,50%)]" /> Liberar Prospecção
            </h1>
            <p className="text-sm text-muted-foreground">
              Atribua acesso de visualização do Prospecção Empresa por período (ano/mês) para Magistrado e Recuperanda.
            </p>
          </div>
        </div>

        <Tabs defaultValue="liberar" className="space-y-4">
          <TabsList className="bg-card border h-auto p-1 flex-wrap">
            <TabsTrigger value="liberar" className="gap-1.5 text-xs data-[state=active]:bg-[hsl(217,91%,50%)] data-[state=active]:text-white">
              <Send className="w-3.5 h-3.5" /> Liberar / Gerenciar
            </TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1.5 text-xs data-[state=active]:bg-[hsl(217,91%,50%)] data-[state=active]:text-white">
              <HistoryIcon className="w-3.5 h-3.5" /> Movimentações Prospecção
            </TabsTrigger>
            <TabsTrigger value="trilha" className="gap-1.5 text-xs data-[state=active]:bg-[hsl(217,91%,50%)] data-[state=active]:text-white">
              <ShieldCheck className="w-3.5 h-3.5" /> Trilha de Auditoria
            </TabsTrigger>
          </TabsList>

          {/* LIBERAR + LISTA */}
          <TabsContent value="liberar" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Send className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Nova liberação de Prospecção
                </CardTitle>
                <CardDescription>
                  Selecione empresa, período e destinatário (Magistrado ou Recuperanda).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                      <Building2 className="w-3.5 h-3.5" /> Empresa Prospecção
                    </label>
                    <Select value={companyId} onValueChange={setCompanyId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a empresa..." /></SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.prospecção_id ? `· ${c.prospecção_id}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                        <Calendar className="w-3.5 h-3.5" /> Ano
                      </label>
                      <Select value={year} onValueChange={setYear}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Mês</label>
                      <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m) => <SelectItem key={m} value={String(m)}>{monthLabel(m)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                        <UserCheck className="w-3.5 h-3.5" /> Perfil
                      </label>
                      <Select value={targetRole} onValueChange={(v) => { setTargetRole(v as ReleaseRole); setTargetUserId(""); }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="magistrado">Magistrado</SelectItem>
                          <SelectItem value="recuperanda">Recuperanda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Destinatário</label>
                      <Select value={targetUserId} onValueChange={setTargetUserId}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {eligibleUsers.length === 0 && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum usuário ativo neste perfil.</div>
                          )}
                          {eligibleUsers.map((u) => (
                            <SelectItem key={u.user_id} value={u.user_id}>{u.full_name} · {u.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="md:col-span-2 lg:col-span-3">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Notas (opcional)</label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observações..." />
                  </div>
                </div>

                <div className="flex justify-end mt-3">
                  <Button onClick={handleRelease} className="gap-1.5">
                    <Send className="w-4 h-4" /> Liberar Prospecção
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Liberações registradas</CardTitle>
                    <CardDescription>Atribua, suspenda ou remova acessos.</CardDescription>
                  </div>
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar empresa, destinatário, período..."
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredReleases.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {loading ? "Carregando..." : "Nenhuma liberação registrada."}
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Empresa Prospecção AJ</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Período</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Destinatário</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Perfil</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Liberado em</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReleases.map((r) => {
                          const c = companiesById.get(r.company_id);
                          const u = profilesById.get(r.released_to_user_id);
                          const cfg = statusLabel[r.status];
                          return (
                            <tr key={r.id} className="border-t hover:bg-muted/30">
                              <td className="px-3 py-2">
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">{c?.name || "Empresa"}</span>
                                  {c?.prospecção_id && <Badge variant="outline" className="text-[10px] font-mono w-fit mt-0.5">{c.prospecção_id}</Badge>}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <Badge className="bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] text-[11px] font-mono border-0">
                                  {monthLabel(r.month)}/{r.year}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-foreground">{u?.full_name || "—"}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-[10px] capitalize">{r.released_to_role}</Badge>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className="inline-flex items-center text-[11px] font-medium px-2 py-1 rounded-full"
                                  style={{ backgroundColor: `${cfg.color}1A`, color: cfg.color }}
                                >
                                  {cfg.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                {formatDateTime(r.created_at)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="inline-flex gap-1">
                                  {r.status === "active" ? (
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1" onClick={() => handleStatus(r, "suspended")}>
                                      <Pause className="w-3 h-3" /> Suspender
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1" onClick={() => handleStatus(r, "active")}>
                                      <Play className="w-3 h-3" /> Reativar
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1 text-destructive" onClick={() => handleDelete(r)}>
                                    <Trash2 className="w-3 h-3" /> Remover
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movimentacoes">
            <RmaMovementHistory
              title="Movimentações Prospecção AJ"
              description="Inclui atribuições, movimentações, desvínculos e liberações para Magistrado/Recuperanda."
            />
          </TabsContent>

          <TabsContent value="trilha">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[hsl(217,91%,50%)]" /> Trilha de Auditoria
                </CardTitle>
                <CardDescription>
                  Todas as liberações ficam registradas (criação, suspensão, reativação e remoção) com data, hora e responsável.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RmaMovementHistory
                  title="Eventos auditáveis"
                  description="Registros imutáveis de movimentações e liberações."
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
};

export default LiberarProspecção;
