import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, LogOut, History as HistoryIcon, Calendar, Flag, User as UserIcon, ArrowRight, Folder } from "lucide-react";
import { toast } from "sonner";
import logoBex from "@/assets/logo-brasil-expert-full.jpeg";

type Folder = { id: string; name: string; created_at: string };
type Card = {
  id: string;
  folder_id: string;
  title: string;
  description: string | null;
  status: string;
  responsible: string;
  priority: string;
  start_date: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
type Hist = {
  id: string;
  card_id: string;
  from_status: string | null;
  to_status: string | null;
  from_responsible: string | null;
  to_responsible: string | null;
  actor: string | null;
  note: string | null;
  created_at: string;
};

const COLUMNS = [
  { key: "todo", label: "To Do (A Fazer)", color: "bg-slate-100 text-slate-700" },
  { key: "doing", label: "Em Andamento", color: "bg-blue-100 text-blue-700" },
  { key: "validation", label: "Em Validação", color: "bg-amber-100 text-amber-700" },
  { key: "done", label: "Concluído", color: "bg-emerald-100 text-emerald-700" },
  { key: "approved", label: "Aprovado", color: "bg-purple-100 text-purple-700" },
];

const STATIC_RESPONSIBLES = ["BEX", "Orange"];
const PRIORITIES = [
  { v: "baixa", label: "Baixa", color: "bg-slate-200 text-slate-700" },
  { v: "media", label: "Média", color: "bg-blue-200 text-blue-700" },
  { v: "alta", label: "Alta", color: "bg-orange-200 text-orange-700" },
  { v: "critica", label: "Crítica", color: "bg-red-200 text-red-700" },
];

const daysSince = (d?: string | null) => {
  if (!d) return 0;
  const ms = Date.now() - new Date(d).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

export default function ControleStatus() {
  const navigate = useNavigate();
  const [actor, setActor] = useState<string>(() => localStorage.getItem("cs_actor") || "");
  const [emailInput, setEmailInput] = useState("");
  const [authUsers, setAuthUsers] = useState<{ email: string; name: string }[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [cards, setCards] = useState<Card[]>([]);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Hist[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newCardOpen, setNewCardOpen] = useState(false);

  // load authorized users (allowlist)
  useEffect(() => {
    supabase.from("control_users" as any).select("email,name").order("name").then(({ data }) => {
      setAuthUsers((data || []) (data as any[] || []) as { email: string; name: string }[]);
    });
  }, []);

  const RESPONSIBLES = useMemo(
    () => [...STATIC_RESPONSIBLES, ...authUsers.map(u => u.name)],
    [authUsers]
  );

  // load folders
  useEffect(() => {
    if (!actor) return;
    supabase.from("control_folders" as any).select("*").order("name").then(({ data }) => {
      const f = (data || []) (data as any[] || []) as Folder[];
      setFolders(f);
      if (f.length && !selectedFolder) setSelectedFolder(f[0].id);
    });
  }, [actor]);

  // load cards for folder
  const refreshCards = async (fid: string) => {
    const { data } = await supabase.from("control_cards" as any).select("*").eq("folder_id", fid).order("created_at");
    setCards((data || []) (data as any[] || []) as Card[]);
  };
  useEffect(() => { if (selectedFolder) refreshCards(selectedFolder); }, [selectedFolder]);

  // history loader
  useEffect(() => {
    if (!openCard || !showHistory) return;
    supabase.from("control_card_history" as any).select("*").eq("card_id", openCard.id).order("created_at", { ascending: false })
      .then(({ data }) => setHistory((data || []) (data as any[] || []) as Hist[]));
  }, [openCard, showHistory]);

  const cardsByCol = useMemo(() => {
    const m: Record<string, Card[]> = {};
    COLUMNS.forEach(c => m[c.key] = []);
    cards.forEach(c => { (m[c.status] ||= []).push(c); });
    return m;
  }, [cards]);

  // Login (set actor name)
  if (!actor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(220,30%,97%)] via-white to-[hsl(217,91%,97%)] p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 border">
          <img src={logoBex} alt="BEx" className="h-12 w-auto mb-6" />
          <h1 className="text-2xl font-bold text-foreground mb-1">Controle & Status</h1>
          <p className="text-sm text-muted-foreground mb-6">Identifique-se para acessar o painel público de atividades.</p>
          <Label className="text-xs">E-mail autorizado</Label>
          {(() => {
            const tryLogin = () => {
              const email = emailInput.trim().toLowerCase();
              if (!email) return;
              const user = authUsers.find(u => u.email.toLowerCase() === email);
              if (!user) { toast.error("E-mail não autorizado a acessar este painel."); return; }
              localStorage.setItem("cs_actor", user.name);
              localStorage.setItem("cs_actor_email", user.email);
              setActor(user.name);
            };
            return (
              <>
                <Input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="seu@email.com"
                  className="mt-1 h-11"
                  onKeyDown={(e) => { if (e.key === "Enter") tryLogin(); }}
                />
                <Button onClick={tryLogin} className="w-full mt-4 h-11 bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,42%)]">Entrar</Button>
              </>
            );
          })()}
          <button onClick={() => navigate("/")} className="block text-xs text-muted-foreground hover:underline mt-4 mx-auto">Voltar ao início</button>
        </div>
      </div>
    );
  }

  const addFolder = async () => {
    if (!newFolderName.trim()) return;
    const { data, error } = await supabase.from("control_folders" as any).insert({ name: newFolderName.trim(), created_by: actor }).select().single();
    if (error) return toast.error("Erro ao criar pasta");
    setFolders([...folders, data as Folder].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedFolder((data as Folder).id);
    setNewFolderName(""); setNewFolderOpen(false);
    toast.success("Pasta adicionada");
  };

  const createCard = async (payload: Partial<Card>) => {
    if (!selectedFolder) return;
    const { data, error } = await supabase.from("control_cards" as any).insert({
      folder_id: selectedFolder,
      title: payload.title || "Nova demanda",
      description: payload.description || null,
      status: "todo",
      responsible: payload.responsible || "BEX",
      priority: payload.priority || "media",
      start_date: payload.start_date || new Date().toISOString().slice(0, 10),
      due_date: payload.due_date || null,
      created_by: actor,
    }).select().single();
    if (error) return toast.error("Erro ao criar card");
    setCards([...cards, data as Card]);
    setNewCardOpen(false);
  };

  const moveCard = async (card: Card, toStatus: string) => {
    const { error } = await supabase.from("control_cards" as any).update({ status: toStatus }).eq("id", card.id);
    if (error) return toast.error("Erro ao mover");
    await supabase.from("control_card_history" as any).insert({
      card_id: card.id, from_status: card.status, to_status: toStatus, actor, note: "Movimentação de coluna",
    });
    refreshCards(selectedFolder);
    if (openCard?.id === card.id) setOpenCard({ ...card, status: toStatus });
  };

  const assignCard = async (card: Card, toResp: string) => {
    const { error } = await supabase.from("control_cards" as any).update({ responsible: toResp }).eq("id", card.id);
    if (error) return toast.error("Erro ao atribuir");
    await supabase.from("control_card_history" as any).insert({
      card_id: card.id, from_responsible: card.responsible, to_responsible: toResp, actor, note: "Atribuição",
    });
    refreshCards(selectedFolder);
    if (openCard?.id === card.id) setOpenCard({ ...card, responsible: toResp });
  };

  const updateCard = async (card: Card, patch: Partial<Card>) => {
    const { error } = await supabase.from("control_cards" as any).update(patch).eq("id", card.id);
    if (error) return toast.error("Erro ao salvar");
    refreshCards(selectedFolder);
  };

  const exportPendencies = () => {
    const pend = cards.filter(c => c.status !== "approved");
    const rows = [["Pasta", "Título", "Status", "Responsável", "Prioridade", "Início", "Entrega", "Dias em execução", "Descrição"]];
    const folderName = folders.find(f => f.id === selectedFolder)?.name || "";
    pend.forEach(c => rows.push([
      folderName, c.title, COLUMNS.find(x => x.key === c.status)?.label || c.status,
      c.responsible, c.priority, c.start_date || "", c.due_date || "",
      String(daysSince(c.start_date)), (c.description || "").replace(/\n/g, " "),
    ]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pendencias_${folderName || "geral"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const logout = () => { localStorage.removeItem("cs_actor"); setActor(""); navigate("/"); };

  // Status tab stats
  const total = cards.length;
  const byCol = COLUMNS.map(c => ({ ...c, count: cardsByCol[c.key]?.length || 0 }));
  const overdue = cards.filter(c => c.due_date && new Date(c.due_date) < new Date() && c.status !== "approved").length;
  const byResp = RESPONSIBLES.map(r => ({ r, count: cards.filter(c => c.responsible === r).length }));

  return (
    <div className="min-h-screen flex bg-[hsl(220,20%,97%)]">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <img src={logoBex} alt="BEx" className="h-8 w-auto mb-2" />
          <div className="text-sm font-bold text-foreground">Controle & Status</div>
          <div className="text-[11px] text-muted-foreground">Painel público de atividades</div>
        </div>
        <div className="p-4 space-y-4 flex-1 overflow-auto">
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Gestão</div>
            <Label className="text-xs">Pasta / Tópico</Label>
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione uma pasta" />
              </SelectTrigger>
              <SelectContent>
                {folders.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => setNewFolderOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Pasta
            </Button>
          </div>

          <div className="pt-2 border-t">
            <Button size="sm" variant="outline" className="w-full" onClick={exportPendencies}>
              <Download className="w-3.5 h-3.5 mr-1" /> Exportar Pendências
            </Button>
          </div>
        </div>
        <div className="p-4 border-t">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-[hsl(217,91%,50%)] text-white text-xs font-bold flex items-center justify-center">
              {actor.split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{actor}</div>
              <div className="text-[10px] text-muted-foreground">Consultor</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="w-full text-destructive" onClick={logout}>
            <LogOut className="w-3.5 h-3.5 mr-1" /> Sair
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <Tabs defaultValue="atividades" className="w-full">
          <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="atividades">Controle de Atividades</TabsTrigger>
            </TabsList>
            <div className="text-xs text-muted-foreground">
              {folders.find(f => f.id === selectedFolder)?.name || "Selecione uma pasta"}
            </div>
          </div>

          {/* STATUS */}
          <TabsContent value="status" className="p-6 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {byCol.map(c => (
                <Card key={c.key}>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{c.label}</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-bold">{c.count}</CardContent>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total de cards</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{total}</CardContent></Card>
              <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Atrasados</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-red-600">{overdue}</CardContent></Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Por responsável</CardTitle></CardHeader>
                <CardContent className="flex gap-3">
                  {byResp.map(r => <div key={r.r} className="flex flex-col"><span className="text-[10px] text-muted-foreground">{r.r}</span><span className="text-xl font-bold">{r.count}</span></div>)}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-sm">Cards recentes</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cards.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8).map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
                      <span className="truncate">{c.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{c.responsible}</Badge>
                        <Badge className={COLUMNS.find(x => x.key === c.status)?.color}>{COLUMNS.find(x => x.key === c.status)?.label}</Badge>
                      </div>
                    </div>
                  ))}
                  {!cards.length && <div className="text-xs text-muted-foreground">Nenhum card ainda.</div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ATIVIDADES KANBAN */}
          <TabsContent value="atividades" className="p-6">
            {!selectedFolder ? (
              <div className="text-sm text-muted-foreground">Selecione ou crie uma pasta na lateral.</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Folder className="w-4 h-4 text-[hsl(217,91%,50%)]" />
                    <span className="font-semibold">{folders.find(f => f.id === selectedFolder)?.name}</span>
                    <span className="text-muted-foreground">— {cards.length} card(s)</span>
                  </div>
                  <Button size="sm" onClick={() => setNewCardOpen(true)} className="bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,42%)]">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Novo card
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                  {COLUMNS.map(col => (
                    <div key={col.key} className="bg-white rounded-lg border min-h-[400px] flex flex-col">
                      <div className={`px-3 py-2 rounded-t-lg ${col.color} flex items-center justify-between`}>
                        <span className="text-xs font-semibold">{col.label}</span>
                        <span className="text-xs">{cardsByCol[col.key]?.length || 0}</span>
                      </div>
                      <div className="p-2 space-y-2 flex-1">
                        {cardsByCol[col.key]?.map(card => {
                          const prio = PRIORITIES.find(p => p.v === card.priority);
                          return (
                            <div key={card.id} onClick={() => { setOpenCard(card); setShowHistory(false); }}
                              className="bg-white border rounded-md p-2.5 cursor-pointer hover:shadow-md transition-shadow space-y-1.5">
                              <div className="text-sm font-medium text-foreground line-clamp-2">{card.title}</div>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="outline" className="text-[10px]"><UserIcon className="w-2.5 h-2.5 mr-0.5" />{card.responsible}</Badge>
                                {prio && <Badge className={`text-[10px] ${prio.color}`}><Flag className="w-2.5 h-2.5 mr-0.5" />{prio.label}</Badge>}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{card.start_date || "—"}</span>
                                <span>{daysSince(card.start_date)}d</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova pasta</DialogTitle></DialogHeader>
          <Label>Nome da pasta</Label>
          <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Ex.: Balancete - Janeiro" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancelar</Button>
            <Button onClick={addFolder}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New card dialog */}
      <NewCardDialog open={newCardOpen} onOpenChange={setNewCardOpen} onCreate={createCard} responsibles={RESPONSIBLES} />

      {/* Card detail */}
      <Dialog open={!!openCard} onOpenChange={(o) => { if (!o) { setOpenCard(null); setShowHistory(false); } }}>
        <DialogContent className="max-w-2xl">
          {openCard && (
            <>
              <DialogHeader>
                <DialogTitle>
                  <Input
                    defaultValue={openCard.title}
                    onBlur={(e) => e.target.value !== openCard.title && updateCard(openCard, { title: e.target.value })}
                    className="text-base font-semibold"
                  />
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Responsável</Label>
                  <Select value={openCard.responsible} onValueChange={(v) => assignCard(openCard, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RESPONSIBLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status / Coluna</Label>
                  <Select value={openCard.status} onValueChange={(v) => moveCard(openCard, v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Prioridade</Label>
                  <Select value={openCard.priority} onValueChange={(v) => updateCard(openCard, { priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Dias em execução</Label>
                  <div className="h-10 px-3 flex items-center text-sm border rounded-md bg-muted/30">{daysSince(openCard.start_date)} dias</div>
                </div>
                <div>
                  <Label className="text-xs">Data de início</Label>
                  <Input type="date" defaultValue={openCard.start_date || ""} onBlur={(e) => e.target.value !== (openCard.start_date || "") && updateCard(openCard, { start_date: e.target.value || null })} />
                </div>
                <div>
                  <Label className="text-xs">Data de entrega</Label>
                  <Input type="date" defaultValue={openCard.due_date || ""} onBlur={(e) => e.target.value !== (openCard.due_date || "") && updateCard(openCard, { due_date: e.target.value || null })} />
                </div>
              </div>

              <div>
                <Label className="text-xs">Descrição</Label>
                <Textarea
                  defaultValue={openCard.description || ""}
                  onBlur={(e) => (e.target.value || "") !== (openCard.description || "") && updateCard(openCard, { description: e.target.value || null })}
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground self-center mr-2">Mover para:</span>
                {COLUMNS.filter(c => c.key !== openCard.status).map(c => (
                  <Button key={c.key} size="sm" variant="outline" onClick={() => moveCard(openCard, c.key)}>
                    <ArrowRight className="w-3 h-3 mr-1" />{c.label}
                  </Button>
                ))}
              </div>

              <div className="pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => setShowHistory(s => !s)}>
                  <HistoryIcon className="w-3.5 h-3.5 mr-1" /> {showHistory ? "Ocultar histórico" : "Mostrar histórico"}
                </Button>
                {showHistory && (
                  <div className="mt-2 space-y-1.5 max-h-60 overflow-auto">
                    {history.length === 0 && <div className="text-xs text-muted-foreground">Sem movimentações.</div>}
                    {history.map(h => (
                      <div key={h.id} className="text-xs border-l-2 border-[hsl(217,91%,50%)] pl-2 py-1">
                        <div className="font-medium">{h.actor || "—"}</div>
                        <div className="text-muted-foreground">
                          {h.from_status && <>Status: {COLUMNS.find(c => c.key === h.from_status)?.label} → {COLUMNS.find(c => c.key === h.to_status)?.label}. </>}
                          {h.from_responsible && <>Responsável: {h.from_responsible} → {h.to_responsible}. </>}
                          {h.note}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewCardDialog({ open, onOpenChange, onCreate, responsibles }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (p: Partial<Card>) => void; responsibles: string[] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("BEX");
  const [priority, setPriority] = useState("media");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState("");

  useEffect(() => { if (!open) { setTitle(""); setDescription(""); setResponsible("BEX"); setPriority("media"); setStart(new Date().toISOString().slice(0, 10)); setDue(""); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova demanda</DialogTitle></DialogHeader>
        <Label>Título</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Revisar conciliação..." />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Responsável</Label>
            <Select value={responsible} onValueChange={setResponsible}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{responsibles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data de início</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Data de entrega</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <Label>Descrição</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!title.trim()} onClick={() => onCreate({ title: title.trim(), description, responsible, priority, start_date: start, due_date: due || null })}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
