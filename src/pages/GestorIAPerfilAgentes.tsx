// Gestor IA — Perfis de Agente & Memória da Empresa (Prompt Builder Adaptativo v3)
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlatformLayout from "@/components/PlatformLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Save, RefreshCw, Plus, Trash2, Brain, Building2, Sparkles, ScrollText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface AgentProfile {
  agent_name: string;
  temperature: number;
  max_tokens: number;
  similarity_threshold: number;
  max_examples: number;
  use_structured_context: boolean;
  use_path_context: boolean;
  strict_mode: boolean;
  require_validation: boolean;
  priority_model: string;
  notes: string | null;
}

interface CompanyContext {
  id: string;
  company_id: string;
  prospecção_id: string | null;
  scope: string;
  chave: string;
  valor: string;
  weight: number;
}

interface CompanyOpt {
  id: string;
  name: string;
  prospecção_id: string | null;
}

interface MemoryItem {
  id: string;
  tipo: string;
  conteudo: string;
  weight: number;
  source: string | null;
  created_at: string;
}

interface RuleItem {
  id: string;
  tipo: string;
  regra: string;
  prioridade: number;
  ativa: boolean;
}

export default function GestorIAPerfilAgentes() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [editing, setEditing] = useState<Record<string, AgentProfile>>({});
  const [loading, setLoading] = useState(true);

  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [contextItems, setContextItems] = useState<CompanyContext[]>([]);
  const [newCtx, setNewCtx] = useState({ scope: "general", chave: "", valor: "", weight: 1.0 });

  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [newMemory, setNewMemory] = useState({ tipo: "regra", conteudo: "" });
  const [savingMemory, setSavingMemory] = useState(false);

  const [ruleItems, setRuleItems] = useState<RuleItem[]>([]);
  const [newRule, setNewRule] = useState({ tipo: "geral", regra: "", prioridade: 5 });

  const loadProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("agent_profiles").select("*").order("agent_name");
    if (error) toast.error("Erro ao carregar perfis: " + error.message);
    else setProfiles((data ?? []) as AgentProfile[]);
    setLoading(false);
  };

  const loadCompanies = async () => {
    const { data } = await supabase.from("companies").select("id,name,prospecção_id").order("name");
    setCompanies((data ?? []) as CompanyOpt[]);
  };

  const loadContext = async (companyId: string) => {
    if (!companyId) return setContextItems([]);
    const { data, error } = await supabase
      .from("company_context")
      .select("*")
      .eq("company_id", companyId)
      .order("scope")
      .order("chave");
    if (error) toast.error("Erro ao carregar contexto: " + error.message);
    else setContextItems((data ?? []) as CompanyContext[]);
  };

  useEffect(() => {
    loadProfiles();
    loadCompanies();
  }, []);

  const loadMemory = async (companyId: string) => {
    if (!companyId) return setMemoryItems([]);
    const { data, error } = await supabase
      .from("company_memory_embeddings")
      .select("id,tipo,conteudo,weight,source,created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error("Erro ao carregar memória: " + error.message);
    else setMemoryItems((data ?? []) as MemoryItem[]);
  };

  const loadRules = async (companyId: string) => {
    if (!companyId) return setRuleItems([]);
    const { data, error } = await supabase
      .from("company_rules")
      .select("id,tipo,regra,prioridade,ativa")
      .eq("company_id", companyId)
      .order("prioridade", { ascending: false });
    if (error) toast.error("Erro ao carregar regras: " + error.message);
    else setRuleItems((data ?? []) as RuleItem[]);
  };

  useEffect(() => {
    loadContext(selectedCompany);
    loadMemory(selectedCompany);
    loadRules(selectedCompany);
  }, [selectedCompany]);

  const updateField = (name: string, field: keyof AgentProfile, value: any) => {
    const base = editing[name] ?? profiles.find((p) => p.agent_name === name)!;
    setEditing({ ...editing, [name]: { ...base, [field]: value } });
  };

  const saveProfile = async (name: string) => {
    const p = editing[name];
    if (!p) return;
    const { error } = await supabase
      .from("agent_profiles")
      .update({
        temperature: Number(p.temperature),
        max_tokens: Number(p.max_tokens),
        similarity_threshold: Number(p.similarity_threshold),
        max_examples: Number(p.max_examples),
        use_structured_context: p.use_structured_context,
        use_path_context: p.use_path_context,
        strict_mode: p.strict_mode,
        require_validation: p.require_validation,
        priority_model: p.priority_model,
        notes: p.notes,
      })
      .eq("agent_name", name);
    if (error) return toast.error("Erro: " + error.message);
    toast.success(`Perfil ${name} salvo`);
    const next = { ...editing };
    delete next[name];
    setEditing(next);
    loadProfiles();
  };

  const addContext = async () => {
    if (!selectedCompany || !newCtx.chave || !newCtx.valor) {
      return toast.error("Empresa, chave e valor são obrigatórios");
    }
    const company = companies.find((c) => c.id === selectedCompany);
    const { error } = await supabase.from("company_context").insert({
      company_id: selectedCompany,
      prospecção_id: company?.prospecção_id ?? null,
      scope: newCtx.scope,
      chave: newCtx.chave,
      valor: newCtx.valor,
      weight: Number(newCtx.weight),
    });
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Contexto adicionado");
    setNewCtx({ scope: "general", chave: "", valor: "", weight: 1.0 });
    loadContext(selectedCompany);
  };

  const removeContext = async (id: string) => {
    const { error } = await supabase.from("company_context").delete().eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Contexto removido");
    loadContext(selectedCompany);
  };

  const addMemory = async () => {
    if (!selectedCompany || !newMemory.conteudo.trim()) {
      return toast.error("Selecione empresa e informe o conteúdo");
    }
    setSavingMemory(true);
    try {
      const company = companies.find((c) => c.id === selectedCompany);
      const { error } = await supabase.from("company_memory_embeddings").insert({
        company_id: selectedCompany,
        prospecção_id: company?.prospecção_id ?? null,
        tipo: newMemory.tipo,
        conteudo: newMemory.conteudo.slice(0, 2000),
        weight: 1.0,
        source: "manual",
      });
      if (error) throw error;
      toast.success("Memória adicionada (sem embedding — será gerado no próximo processamento).");
      setNewMemory({ tipo: "regra", conteudo: "" });
      loadMemory(selectedCompany);
    } catch (e: any) {
      toast.error("Erro: " + (e.message ?? String(e)));
    } finally {
      setSavingMemory(false);
    }
  };

  const removeMemory = async (id: string) => {
    const { error } = await supabase.from("company_memory_embeddings").delete().eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Memória removida");
    loadMemory(selectedCompany);
  };

  const addRule = async () => {
    if (!selectedCompany || !newRule.regra.trim()) {
      return toast.error("Selecione empresa e informe a regra");
    }
    const company = companies.find((c) => c.id === selectedCompany);
    const { error } = await supabase.from("company_rules").insert({
      company_id: selectedCompany,
      prospecção_id: company?.prospecção_id ?? null,
      tipo: newRule.tipo,
      regra: newRule.regra,
      prioridade: Number(newRule.prioridade),
      ativa: true,
    });
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Regra adicionada");
    setNewRule({ tipo: "geral", regra: "", prioridade: 5 });
    loadRules(selectedCompany);
  };

  const toggleRule = async (id: string, ativa: boolean) => {
    const { error } = await supabase.from("company_rules").update({ ativa: !ativa }).eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    loadRules(selectedCompany);
  };

  const removeRule = async (id: string) => {
    const { error } = await supabase.from("company_rules").delete().eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Regra removida");
    loadRules(selectedCompany);
  };

  return (
    <PlatformLayout>
      <div className="px-6 lg:px-8 py-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" /> Prompt Builder Adaptativo
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Perfis de agente · Memória da empresa</p>
          </div>
          <Button size="sm" variant="outline" onClick={loadProfiles} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Recarregar
          </Button>
        </div>

        <Tabs defaultValue="profiles">
          <TabsList>
            <TabsTrigger value="profiles" className="gap-1.5"><Brain className="w-3.5 h-3.5" /> Perfis de Agente</TabsTrigger>
            <TabsTrigger value="memory" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> Fatos da Empresa</TabsTrigger>
            <TabsTrigger value="semantic" className="gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Memória Semântica</TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5"><ScrollText className="w-3.5 h-3.5" /> Regras de Negócio</TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="mt-4 space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!loading && profiles.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum perfil cadastrado.</p>
            )}
            {profiles.map((orig) => {
              const p = editing[orig.agent_name] ?? orig;
              const dirty = !!editing[orig.agent_name];
              return (
                <Card key={orig.agent_name} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground">{orig.agent_name}</h3>
                    <div className="flex gap-2 items-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${p.priority_model === "pro" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {p.priority_model}
                      </span>
                      {dirty && (
                        <Button size="sm" onClick={() => saveProfile(orig.agent_name)} className="gap-1.5">
                          <Save className="w-3.5 h-3.5" /> Salvar
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <Label className="text-[11px]">Temperature</Label>
                      <Input type="number" step="0.05" value={p.temperature}
                        onChange={(e) => updateField(orig.agent_name, "temperature", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-[11px]">Max Tokens</Label>
                      <Input type="number" value={p.max_tokens}
                        onChange={(e) => updateField(orig.agent_name, "max_tokens", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-[11px]">Similarity Threshold</Label>
                      <Input type="number" step="0.01" value={p.similarity_threshold}
                        onChange={(e) => updateField(orig.agent_name, "similarity_threshold", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-[11px]">Max Examples</Label>
                      <Input type="number" value={p.max_examples}
                        onChange={(e) => updateField(orig.agent_name, "max_examples", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-[11px]">Modelo Prioritário</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={p.priority_model}
                        onChange={(e) => updateField(orig.agent_name, "priority_model", e.target.value)}
                      >
                        <option value="flash-lite">flash-lite</option>
                        <option value="flash">flash</option>
                        <option value="pro">pro</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Switch checked={p.strict_mode}
                        onCheckedChange={(v) => updateField(orig.agent_name, "strict_mode", v)} />
                      <Label className="text-[11px]">Strict mode</Label>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Switch checked={p.use_path_context}
                        onCheckedChange={(v) => updateField(orig.agent_name, "use_path_context", v)} />
                      <Label className="text-[11px]">Path context</Label>
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Switch checked={p.use_structured_context}
                        onCheckedChange={(v) => updateField(orig.agent_name, "use_structured_context", v)} />
                      <Label className="text-[11px]">Structured ctx</Label>
                    </div>
                  </div>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="memory" className="mt-4 space-y-4">
            <Card className="p-4 space-y-3">
              <div>
                <Label className="text-xs">Empresa</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                >
                  <option value="">— Selecione uma empresa —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} {c.prospecção_id ? `(${c.prospecção_id})` : ""}</option>
                  ))}
                </select>
              </div>

              {selectedCompany && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <div>
                      <Label className="text-[11px]">Escopo</Label>
                      <Input value={newCtx.scope} onChange={(e) => setNewCtx({ ...newCtx, scope: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[11px]">Chave</Label>
                      <Input placeholder="ex: conta_caixa" value={newCtx.chave}
                        onChange={(e) => setNewCtx({ ...newCtx, chave: e.target.value })} />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-[11px]">Valor</Label>
                      <Input placeholder="ex: 1.1.01.001 - Caixa Geral" value={newCtx.valor}
                        onChange={(e) => setNewCtx({ ...newCtx, valor: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[11px]">Peso</Label>
                      <div className="flex gap-2">
                        <Input type="number" step="0.1" value={newCtx.weight}
                          onChange={(e) => setNewCtx({ ...newCtx, weight: Number(e.target.value) })} />
                        <Button size="sm" onClick={addContext} className="gap-1.5">
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    {contextItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum contexto cadastrado para esta empresa.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="py-2">Escopo</th>
                            <th>Chave</th>
                            <th>Valor</th>
                            <th className="text-right">Peso</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {contextItems.map((ctx) => (
                            <tr key={ctx.id} className="border-b">
                              <td className="py-2">{ctx.scope}</td>
                              <td className="font-mono">{ctx.chave}</td>
                              <td>{ctx.valor}</td>
                              <td className="text-right">{ctx.weight}</td>
                              <td className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => removeContext(ctx.id)}>
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="semantic" className="mt-4 space-y-4">
            <Card className="p-4 space-y-3">
              <div>
                <Label className="text-xs">Empresa</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                >
                  <option value="">— Selecione uma empresa —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} {c.prospecção_id ? `(${c.prospecção_id})` : ""}</option>
                  ))}
                </select>
              </div>

              {selectedCompany && (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Trechos textuais usados no RAG da empresa. O embedding é gerado automaticamente em cada validação humana (<code className="bg-muted px-1 rounded">ai-validate</code>). Itens criados aqui ficam sem embedding até serem reprocessados.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <div>
                      <Label className="text-[11px]">Tipo</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={newMemory.tipo}
                        onChange={(e) => setNewMemory({ ...newMemory, tipo: e.target.value })}
                      >
                        <option value="regra">regra</option>
                        <option value="padrao">padrão</option>
                        <option value="comportamento">comportamento</option>
                        <option value="erro">erro recorrente</option>
                        <option value="contexto_documento">contexto_documento</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <Label className="text-[11px]">Conteúdo</Label>
                      <Textarea rows={2} placeholder="Ex: O banco principal é Itaú agência 1234, conta 56789-0"
                        value={newMemory.conteudo}
                        onChange={(e) => setNewMemory({ ...newMemory, conteudo: e.target.value })} />
                    </div>
                    <div>
                      <Button size="sm" onClick={addMemory} disabled={savingMemory} className="gap-1.5 w-full">
                        <Plus className="w-3.5 h-3.5" /> Adicionar
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-3 max-h-[480px] overflow-auto">
                    {memoryItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma memória registrada.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="py-2">Tipo</th>
                            <th>Conteúdo</th>
                            <th className="text-right">Peso</th>
                            <th>Origem</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {memoryItems.map((m) => (
                            <tr key={m.id} className="border-b align-top">
                              <td className="py-2">{m.tipo}</td>
                              <td className="max-w-md">{m.conteudo}</td>
                              <td className="text-right">{Number(m.weight).toFixed(2)}</td>
                              <td className="text-[10px] text-muted-foreground">{m.source ?? "—"}</td>
                              <td className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => removeMemory(m.id)}>
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="mt-4 space-y-4">
            <Card className="p-4 space-y-3">
              <div>
                <Label className="text-xs">Empresa</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                >
                  <option value="">— Selecione uma empresa —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} {c.prospecção_id ? `(${c.prospecção_id})` : ""}</option>
                  ))}
                </select>
              </div>

              {selectedCompany && (
                <>
                  <p className="text-[11px] text-muted-foreground">
                    Regras textuais ativas são injetadas como instruções obrigatórias no system prompt da IA.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                    <div>
                      <Label className="text-[11px]">Tipo</Label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                        value={newRule.tipo}
                        onChange={(e) => setNewRule({ ...newRule, tipo: e.target.value })}
                      >
                        <option value="geral">geral</option>
                        <option value="classificacao">classificação</option>
                        <option value="conta">conta</option>
                        <option value="fornecedor">fornecedor</option>
                        <option value="banco">banco</option>
                      </select>
                    </div>
                    <div className="md:col-span-4">
                      <Label className="text-[11px]">Regra</Label>
                      <Input placeholder="Ex: Toda transferência para CNPJ 00.000.000/0001-00 deve ir na conta 4.1.01.005"
                        value={newRule.regra}
                        onChange={(e) => setNewRule({ ...newRule, regra: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px]">Prioridade</Label>
                        <Input type="number" min={1} max={10} value={newRule.prioridade}
                          onChange={(e) => setNewRule({ ...newRule, prioridade: Number(e.target.value) })} />
                      </div>
                      <div className="flex items-end">
                        <Button size="sm" onClick={addRule} className="gap-1.5 w-full">
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    {ruleItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma regra cadastrada.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="py-2">Tipo</th>
                            <th>Regra</th>
                            <th className="text-right">Prio</th>
                            <th>Ativa</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ruleItems.map((r) => (
                            <tr key={r.id} className="border-b">
                              <td className="py-2">{r.tipo}</td>
                              <td>{r.regra}</td>
                              <td className="text-right">{r.prioridade}</td>
                              <td>
                                <Switch checked={r.ativa} onCheckedChange={() => toggleRule(r.id, r.ativa)} />
                              </td>
                              <td className="text-right">
                                <Button size="sm" variant="ghost" onClick={() => removeRule(r.id)}>
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
}
