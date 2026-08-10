import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Download, FileText, Eye, Shield, AlertTriangle,
  Clock, Hash, ArrowRight, ChevronDown, ChevronUp, Filter,
  Lock, Link2, Activity, Scale, FileCheck, Fingerprint
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────
type Criticidade = "critico" | "medio" | "baixo";
type EventType =
  | "ALTERACAO_STATUS_RMA"
  | "APROVACAO_DOCUMENTO"
  | "UPLOAD_DOCUMENTO"
  | "CIENCIA_DOCUMENTO"
  | "VISUALIZACAO_RMA"
  | "EXPORT_LOGS"
  | "ALTERACAO_CADASTRAL"
  | "DECISAO_JURIDICA"
  | "DOWNLOAD_ARQUIVO"
  | "LOGIN"
  | "LOGOUT";

interface AuditTrailLog {
  id: string;
  eventType: EventType;
  criticidade: Criticidade;
  rmaId: string;
  processoNumero: string;
  etapa: string;
  userNome: string;
  userLogin: string;
  userPerfil: string;
  acao: string;
  modulo: string;
  beforeData: Record<string, string> | null;
  afterData: Record<string, string> | null;
  timestamp: string;
  ip: string;
  dispositivo: string;
  hash: string;
  previousHash: string;
}

// ─── Mock Data ───────────────────────────────────────────────
const mockLogs: AuditTrailLog[] = [];

// ─── Helpers ─────────────────────────────────────────────────
const criticidadeConfig: Record<Criticidade, { label: string; color: string; bg: string }> = {
  critico: { label: "Crítico", color: "hsl(0,80%,55%)", bg: "hsl(0,80%,55%)" },
  medio: { label: "Médio", color: "hsl(38,90%,55%)", bg: "hsl(38,90%,55%)" },
  baixo: { label: "Baixo", color: "hsl(152,70%,45%)", bg: "hsl(152,70%,45%)" },
};

const eventTypeLabels: Record<EventType, string> = {
  ALTERACAO_STATUS_RMA: "Alteração de Status",
  APROVACAO_DOCUMENTO: "Aprovação de Documento",
  UPLOAD_DOCUMENTO: "Upload de Documento",
  CIENCIA_DOCUMENTO: "Ciência de Documento",
  VISUALIZACAO_RMA: "Visualização de RMA",
  EXPORT_LOGS: "Exportação de Logs",
  ALTERACAO_CADASTRAL: "Alteração Cadastral",
  DECISAO_JURIDICA: "Decisão Jurídica",
  DOWNLOAD_ARQUIVO: "Download de Arquivo",
  LOGIN: "Login",
  LOGOUT: "Logout",
};

const formatDateTime = (ts: string) => {
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const getPerfilColor = (perfil: string) => {
  const map: Record<string, string> = {
    Coordenador: "hsl(258,90%,66%)",
    Consultor: "hsl(210,80%,55%)",
    Magistrado: "hsl(0,70%,55%)",
    "Empresa Prospecção": "hsl(38,90%,55%)",
    "Gestor IA": "hsl(152,70%,45%)",
  };
  return map[perfil] || "hsl(215,12%,50%)";
};

// ─── Component ───────────────────────────────────────────────
const TabTrilhaAuditoria = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCriticidade, setFilterCriticidade] = useState("todos");
  const [filterEventType, setFilterEventType] = useState("todos");
  const [filterPerfil, setFilterPerfil] = useState("todos");
  const [filterRma, setFilterRma] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailLog, setDetailLog] = useState<AuditTrailLog | null>(null);
  const [subTab, setSubTab] = useState("timeline");

  const filtered = mockLogs.filter(log => {
    if (filterCriticidade !== "todos" && log.criticidade !== filterCriticidade) return false;
    if (filterEventType !== "todos" && log.eventType !== filterEventType) return false;
    if (filterPerfil !== "todos" && log.userPerfil !== filterPerfil) return false;
    if (filterRma && !log.rmaId.toLowerCase().includes(filterRma.toLowerCase())) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return (
        log.userNome.toLowerCase().includes(s) ||
        log.userLogin.toLowerCase().includes(s) ||
        log.acao.toLowerCase().includes(s) ||
        log.id.toLowerCase().includes(s) ||
        log.modulo.toLowerCase().includes(s)
      );
    }
    return true;
  });

  // KPIs
  const totalEvents = mockLogs.length;
  const criticos = mockLogs.filter(l => l.criticidade === "critico").length;
  const medios = mockLogs.filter(l => l.criticidade === "medio").length;
  const baixos = mockLogs.filter(l => l.criticidade === "baixo").length;
  const uniqueRmas = new Set(mockLogs.filter(l => l.rmaId !== "-").map(l => l.rmaId)).size;

  const handleExportCSV = () => {
    const headers = ["ID", "Tipo Evento", "Criticidade", "RMA", "Processo", "Etapa", "Usuário", "Login", "Perfil", "Ação", "Módulo", "Antes", "Depois", "Data/Hora", "IP", "Dispositivo", "Hash"];
    const rows = filtered.map(l => [
      l.id, eventTypeLabels[l.eventType], criticidadeConfig[l.criticidade].label,
      l.rmaId, l.processoNumero, l.etapa, l.userNome, l.userLogin, l.userPerfil,
      l.acao, l.modulo,
      l.beforeData ? JSON.stringify(l.beforeData) : "",
      l.afterData ? JSON.stringify(l.afterData) : "",
      formatDateTime(l.timestamp), l.ip, l.dispositivo, l.hash
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trilha_auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trilha_auditoria_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Unique RMAs for timeline
  const rmaTimelines = Array.from(new Set(mockLogs.filter(l => l.rmaId !== "-").map(l => l.rmaId)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            Trilha de Auditoria Jurídica
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Rastreabilidade completa • Imutável • Validade jurídica • LGPD • ISO 27001</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportCSV}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportJSON}>
            <Download className="w-3.5 h-3.5" /> JSON
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total de Eventos", value: totalEvents, icon: Activity, color: "hsl(258,90%,66%)" },
          { label: "Eventos Críticos", value: criticos, icon: AlertTriangle, color: "hsl(0,80%,55%)" },
          { label: "Eventos Médios", value: medios, icon: Clock, color: "hsl(38,90%,55%)" },
          { label: "Eventos Baixos", value: baixos, icon: Eye, color: "hsl(152,70%,45%)" },
          { label: "Prospecções AJ Rastreados", value: uniqueRmas, icon: FileCheck, color: "hsl(210,80%,55%)" },
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 relative overflow-hidden">
            <div className="absolute top-2 right-2 opacity-10">
              <kpi.icon className="w-10 h-10" style={{ color: kpi.color }} />
            </div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${kpi.color}15` }}>
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
            </div>
            <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
            <div className="text-xs text-muted-foreground">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="bg-card border border-border h-auto p-1">
          <TabsTrigger value="timeline" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <Clock className="w-3.5 h-3.5" /> Linha do Tempo
          </TabsTrigger>
          <TabsTrigger value="eventos" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <FileText className="w-3.5 h-3.5" /> Eventos & Diff
          </TabsTrigger>
          <TabsTrigger value="consentimento" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <FileCheck className="w-3.5 h-3.5" /> Consentimento & Ciência
          </TabsTrigger>
          <TabsTrigger value="cadeia" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <Link2 className="w-3.5 h-3.5" /> Cadeia de Custódia
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5 data-[state=active]:bg-[hsl(258,90%,66%)] data-[state=active]:text-white text-xs">
            <Scale className="w-3.5 h-3.5" /> Compliance
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Linha do Tempo ── */}
        <TabsContent value="timeline" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Reconstrução cronológica completa dos eventos por processo Prospecção AJ.</p>
          {rmaTimelines.map(rmaId => {
            const rmaLogs = mockLogs.filter(l => l.rmaId === rmaId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            return (
              <Card key={rmaId} className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[hsl(258,90%,66%)]" />
                    {rmaId}
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      {rmaLogs[0]?.processoNumero}
                    </span>
                    <Badge variant="outline" className="ml-auto text-xs">{rmaLogs.length} eventos</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="relative pl-6 space-y-4">
                    <div className="absolute left-2.5 top-1 bottom-1 w-0.5 bg-border" />
                    {rmaLogs.map((log, i) => {
                      const cfg = criticidadeConfig[log.criticidade];
                      return (
                        <div key={log.id} className="relative">
                          <div className="absolute -left-[18px] top-1.5 w-3 h-3 rounded-full border-2 border-card" style={{ background: cfg.color }} />
                          <div className="bg-muted/30 rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setDetailLog(log)}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground">{formatDateTime(log.timestamp)}</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: cfg.color }}>{cfg.label}</span>
                                <span className="text-xs font-semibold text-foreground">{eventTypeLabels[log.eventType]}</span>
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${getPerfilColor(log.userPerfil)}15`, color: getPerfilColor(log.userPerfil) }}>
                                {log.userPerfil}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{log.acao} — <span className="font-medium text-foreground">{log.userNome}</span></p>
                            {(log.beforeData || log.afterData) && (
                              <div className="flex items-center gap-2 mt-2 text-xs">
                                {log.beforeData && (
                                  <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive font-mono">
                                    {Object.entries(log.beforeData).map(([k, v]) => `${k}: ${v}`).join(", ")}
                                  </span>
                                )}
                                {log.beforeData && log.afterData && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                                {log.afterData && (
                                  <span className="px-2 py-0.5 rounded bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] font-mono">
                                    {Object.entries(log.afterData).map(([k, v]) => `${k}: ${v}`).join(", ")}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ── Tab: Eventos & Diff ── */}
        <TabsContent value="eventos" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="bg-card rounded-xl border border-border p-3 flex flex-wrap gap-2 items-center">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 flex-1 max-w-[220px]">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                placeholder="Buscar usuário, ação, ID..."
                className="bg-transparent text-xs outline-none flex-1 text-foreground placeholder:text-muted-foreground"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterCriticidade} onValueChange={setFilterCriticidade}>
              <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Criticidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
                <SelectItem value="medio">Médio</SelectItem>
                <SelectItem value="baixo">Baixo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterEventType} onValueChange={setFilterEventType}>
              <SelectTrigger className="h-8 text-xs w-[170px]"><SelectValue placeholder="Tipo de evento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {Object.entries(eventTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPerfil} onValueChange={setFilterPerfil}>
              <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Perfil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Coordenador">Coordenador</SelectItem>
                <SelectItem value="Consultor">Consultor</SelectItem>
                <SelectItem value="Magistrado">Magistrado</SelectItem>
                <SelectItem value="Empresa Prospecção">Empresa Prospecção</SelectItem>
                <SelectItem value="Gestor IA">Gestor IA</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 py-1.5 max-w-[140px]">
              <input
                placeholder="Prospecção AJ ID..."
                className="bg-transparent text-xs outline-none flex-1 text-foreground placeholder:text-muted-foreground w-full"
                value={filterRma}
                onChange={e => setFilterRma(e.target.value)}
              />
            </div>
          </div>

          {/* Results count */}
          <div className="text-xs text-muted-foreground">{filtered.length} evento(s) encontrado(s)</div>

          {/* Table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8" />
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Evento</TableHead>
                  <TableHead className="text-xs">Criticidade</TableHead>
                  <TableHead className="text-xs">Prospecção AJ</TableHead>
                  <TableHead className="text-xs">Usuário</TableHead>
                  <TableHead className="text-xs">Perfil</TableHead>
                  <TableHead className="text-xs">Data/Hora</TableHead>
                  <TableHead className="text-xs">Módulo</TableHead>
                  <TableHead className="text-xs w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(log => {
                  const cfg = criticidadeConfig[log.criticidade];
                  const isExpanded = expandedRow === log.id;
                  return (
                    <>
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                      >
                        <TableCell className="p-2">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{log.id}</TableCell>
                        <TableCell className="text-xs">{eventTypeLabels[log.eventType]}</TableCell>
                        <TableCell>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: cfg.color }}>{cfg.label}</span>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{log.rmaId}</TableCell>
                        <TableCell className="text-xs">{log.userNome}</TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${getPerfilColor(log.userPerfil)}15`, color: getPerfilColor(log.userPerfil) }}>
                            {log.userPerfil}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{formatDateTime(log.timestamp)}</TableCell>
                        <TableCell className="text-xs">{log.modulo}</TableCell>
                        <TableCell className="p-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setDetailLog(log); }}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${log.id}-detail`}>
                          <TableCell colSpan={10} className="bg-muted/20 p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              <div>
                                <p className="font-semibold text-foreground mb-1">Ação</p>
                                <p className="text-muted-foreground">{log.acao}</p>
                                <p className="font-semibold text-foreground mt-2 mb-1">Processo</p>
                                <p className="text-muted-foreground font-mono">{log.processoNumero}</p>
                                <p className="font-semibold text-foreground mt-2 mb-1">Etapa</p>
                                <p className="text-muted-foreground">{log.etapa}</p>
                              </div>
                              <div>
                                <p className="font-semibold text-foreground mb-1">Diff (Antes → Depois)</p>
                                {log.beforeData ? (
                                  <div className="space-y-1">
                                    {Object.keys({ ...log.beforeData, ...log.afterData }).map(key => (
                                      <div key={key} className="flex items-center gap-2">
                                        <span className="text-muted-foreground font-mono">{key}:</span>
                                        {log.beforeData?.[key] && (
                                          <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive line-through font-mono">{log.beforeData[key]}</span>
                                        )}
                                        <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                        {log.afterData?.[key] && (
                                          <span className="px-1.5 py-0.5 rounded bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] font-mono">{log.afterData[key]}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground italic">Sem alterações de dados</p>
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-foreground mb-1">Metadados Técnicos</p>
                                <div className="space-y-1 text-muted-foreground">
                                  <p>IP: <span className="font-mono">{log.ip}</span></p>
                                  <p>Dispositivo: {log.dispositivo}</p>
                                  <p className="break-all">Hash: <span className="font-mono text-[10px]">{log.hash}</span></p>
                                  <p className="break-all">Hash anterior: <span className="font-mono text-[10px]">{log.previousHash}</span></p>
                                </div>
                                <div className="mt-2 flex items-center gap-1 text-[hsl(152,70%,45%)]">
                                  <Lock className="w-3 h-3" />
                                  <span className="text-[10px] font-semibold">Registro imutável (WORM)</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">
                      Nenhum evento encontrado com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab: Consentimento & Ciência ── */}
        <TabsContent value="consentimento" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Registro de visualizações, ciências de decisão, aceites de termos e downloads de documentos sensíveis.</p>
          <div className="grid gap-3">
            {mockLogs
              .filter(l => ["CIENCIA_DOCUMENTO", "VISUALIZACAO_RMA", "DOWNLOAD_ARQUIVO"].includes(l.eventType))
              .map(log => {
                const cfg = criticidadeConfig[log.criticidade];
                return (
                  <div key={log.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setDetailLog(log)}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${cfg.color}15` }}>
                        {log.eventType === "CIENCIA_DOCUMENTO" ? <FileCheck className="w-5 h-5" style={{ color: cfg.color }} /> :
                         log.eventType === "DOWNLOAD_ARQUIVO" ? <Download className="w-5 h-5" style={{ color: cfg.color }} /> :
                         <Eye className="w-5 h-5" style={{ color: cfg.color }} />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">{eventTypeLabels[log.eventType]}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{log.acao}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono text-muted-foreground">{formatDateTime(log.timestamp)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${getPerfilColor(log.userPerfil)}15`, color: getPerfilColor(log.userPerfil) }}>
                            {log.userNome} ({log.userPerfil})
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{log.rmaId}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: cfg.color }}>{cfg.label}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </TabsContent>

        {/* ── Tab: Cadeia de Custódia ── */}
        <TabsContent value="cadeia" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Cadeia de custódia digital com encadeamento de hashes — rastreabilidade forense completa.</p>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="w-4 h-4 text-[hsl(258,90%,66%)]" />
              <span className="text-sm font-semibold text-foreground">Encadeamento de Registros (Blockchain Leve)</span>
            </div>
            <div className="space-y-3">
              {mockLogs.slice().reverse().map((log, i, arr) => {
                const cfg = criticidadeConfig[log.criticidade];
                return (
                  <div key={log.id} className="relative">
                    {i < arr.length - 1 && (
                      <div className="absolute left-5 top-12 w-0.5 h-6 bg-border" />
                    )}
                    <div className="flex items-start gap-3 bg-muted/20 rounded-lg p-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setDetailLog(log)}>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${cfg.color}15` }}>
                        <Hash className="w-4 h-4" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-foreground">{log.id}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: cfg.color }}>{cfg.label}</span>
                          <span className="text-xs text-muted-foreground">{eventTypeLabels[log.eventType]}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{log.acao} — {log.userNome}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground break-all">
                            Hash: {log.hash.slice(0, 16)}...
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-[10px] font-mono text-muted-foreground break-all">
                            Prev: {log.previousHash.slice(0, 16)}...
                          </span>
                          <Lock className="w-3 h-3 text-[hsl(152,70%,45%)] ml-1" />
                        </div>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{formatDateTime(log.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab: Compliance ── */}
        <TabsContent value="compliance" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: "LGPD",
                icon: Shield,
                color: "hsl(258,90%,66%)",
                items: ["Proteção de dados pessoais nos logs", "Controle de acesso restrito ao Gestor IA", "Minimização de dados sensíveis", "Direito de acesso e portabilidade"]
              },
              {
                title: "ISO 27001",
                icon: Lock,
                color: "hsl(210,80%,55%)",
                items: ["Controle de auditoria A.12.4", "Gestão de logs e monitoramento", "Segurança da informação", "Registros imutáveis (WORM)"]
              },
              {
                title: "Boas Práticas (Big Four)",
                icon: Scale,
                color: "hsl(152,70%,45%)",
                items: ["Rastreabilidade completa de ações", "Independência de auditoria", "Evidência verificável e forense", "Cadeia de custódia digital"]
              },
            ].map((section, i) => (
              <Card key={i} className="border-border" style={{ borderTopColor: section.color, borderTopWidth: 3 }}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <section.icon className="w-4 h-4" style={{ color: section.color }} />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-2">
                    {section.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: section.color }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Security footer */}
          <div className="bg-muted/30 rounded-xl border border-border p-4 flex items-center gap-3">
            <Lock className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            <div>
              <p className="text-xs font-semibold text-foreground">Registros protegidos por política WORM (Write Once, Read Many)</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Logs imutáveis • Encadeamento por hash • Acesso restrito • Auditoria sobre auditoria • Retenção configurável (12-60 meses)
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailLog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Fingerprint className="w-5 h-5 text-[hsl(258,90%,66%)]" />
                  Detalhe do Evento — {detailLog.id}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                {/* Event header */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ background: criticidadeConfig[detailLog.criticidade].color }}>
                    {criticidadeConfig[detailLog.criticidade].label}
                  </span>
                  <Badge variant="outline">{eventTypeLabels[detailLog.eventType]}</Badge>
                  <span className="text-xs font-mono text-muted-foreground ml-auto">{formatDateTime(detailLog.timestamp)}</span>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    ["Usuário", detailLog.userNome],
                    ["Login", detailLog.userLogin],
                    ["Perfil", detailLog.userPerfil],
                    ["RMA", detailLog.rmaId],
                    ["Processo", detailLog.processoNumero],
                    ["Etapa", detailLog.etapa],
                    ["Módulo", detailLog.modulo],
                    ["IP", detailLog.ip],
                    ["Dispositivo", detailLog.dispositivo],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-muted-foreground">{label}</p>
                      <p className="font-medium text-foreground">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Action */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ação Executada</p>
                  <p className="text-sm font-medium text-foreground bg-muted/30 rounded-lg p-3">{detailLog.acao}</p>
                </div>

                {/* Diff */}
                {(detailLog.beforeData || detailLog.afterData) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Estado da Informação (Diff)</p>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                      {Object.keys({ ...detailLog.beforeData, ...detailLog.afterData }).map(key => (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-muted-foreground w-24">{key}:</span>
                          {detailLog.beforeData?.[key] && (
                            <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive line-through font-mono">{detailLog.beforeData[key]}</span>
                          )}
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          {detailLog.afterData?.[key] && (
                            <span className="px-2 py-0.5 rounded bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)] font-mono">{detailLog.afterData[key]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hash chain */}
                <div className="bg-muted/20 rounded-lg p-3 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-3.5 h-3.5 text-[hsl(152,70%,45%)]" />
                    <span className="text-xs font-semibold text-foreground">Integridade do Registro (WORM)</span>
                  </div>
                  <div className="space-y-1 text-[10px] font-mono text-muted-foreground break-all">
                    <p>Hash: {detailLog.hash}</p>
                    <p>Hash anterior: {detailLog.previousHash}</p>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setDetailLog(null)}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TabTrilhaAuditoria;
