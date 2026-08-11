import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Search, Download, ChevronLeft, ChevronRight, Monitor, Smartphone, Tablet,
  LogIn, LogOut, Eye, Upload, CheckCircle2, XCircle, FileDown, Edit, Clock,
  Shield, Trash2
} from "lucide-react";

// ─── Mock Data ───────────────────────────────────────────────
const mockAccessLogs: any[] = [];

const acaoOptions = ["Todas", "Login", "Logout", "Visualização de Prospeccao", "Upload de documento", "Aprovação/Reprovação", "Alteração de dados", "Download de arquivos"];
const perfilOptions = ["Todos", "Coordenador", "Consultor", "Magistrado", "Empresa Prospeccao", "Gestor IA"];
const moduloOptions = ["Todos", "Dashboard", "Prospeccao", "Documentos", "Relatórios", "Gestor IA", "Financeiro"];

const ITEMS_PER_PAGE = 8;

const getDeviceIcon = (d: string) => {
  if (d === "mobile") return <Smartphone className="w-3.5 h-3.5" />;
  if (d === "tablet") return <Tablet className="w-3.5 h-3.5" />;
  return <Monitor className="w-3.5 h-3.5" />;
};

const getAcaoIcon = (a: string) => {
  switch (a) {
    case "Login": return <LogIn className="w-3.5 h-3.5 text-[hsl(152,70%,45%)]" />;
    case "Logout": return <LogOut className="w-3.5 h-3.5 text-muted-foreground" />;
    case "Visualização de Prospeccao": return <Eye className="w-3.5 h-3.5 text-[hsl(258,90%,66%)]" />;
    case "Upload de documento": return <Upload className="w-3.5 h-3.5 text-[hsl(38,90%,55%)]" />;
    case "Aprovação/Reprovação": return <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(152,70%,45%)]" />;
    case "Alteração de dados": return <Edit className="w-3.5 h-3.5 text-[hsl(0,70%,55%)]" />;
    case "Download de arquivos": return <FileDown className="w-3.5 h-3.5 text-[hsl(258,90%,66%)]" />;
    default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const getPerfilColor = (p: string) => {
  switch (p) {
    case "Coordenador": return "bg-[hsl(258,90%,66%)]/10 text-[hsl(258,90%,66%)]";
    case "Consultor": return "bg-[hsl(210,80%,50%)]/10 text-[hsl(210,80%,50%)]";
    case "Magistrado": return "bg-[hsl(38,90%,55%)]/10 text-[hsl(38,90%,55%)]";
    case "Empresa Prospeccao": return "bg-[hsl(152,70%,45%)]/10 text-[hsl(152,70%,45%)]";
    case "Gestor IA": return "bg-[hsl(0,70%,55%)]/10 text-[hsl(0,70%,55%)]";
    default: return "bg-muted text-muted-foreground";
  }
};

const TabRegistroAcesso = () => {
  const [logs, setLogs] = useState(mockAccessLogs);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPerfil, setFilterPerfil] = useState("Todos");
  const [filterAcao, setFilterAcao] = useState("Todas");
  const [filterModulo, setFilterModulo] = useState("Todos");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return logs.filter(log => {
      const matchSearch = !searchTerm || log.nome.toLowerCase().includes(searchTerm.toLowerCase()) || log.login.toLowerCase().includes(searchTerm.toLowerCase());
      const matchPerfil = filterPerfil === "Todos" || log.perfil === filterPerfil;
      const matchAcao = filterAcao === "Todas" || log.acao === filterAcao;
      const matchModulo = filterModulo === "Todos" || log.modulo === filterModulo;
      return matchSearch && matchPerfil && matchAcao && matchModulo;
    });
  }, [logs, searchTerm, filterPerfil, filterAcao, filterModulo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleExportCSV = () => {
    const headers = ["Nome", "Login", "Perfil", "Data", "Hora Login", "Hora Logout", "Tempo Sessão", "IP", "Dispositivo", "Navegador", "Ação", "Descrição", "Módulo"];
    const rows = filtered.map(l => [l.nome, l.login, l.perfil, l.data, l.horaLogin, l.horaLogout, l.tempoSessao, l.ip, l.dispositivo, l.navegador, l.acao, l.descricao, l.modulo]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date();
    a.href = url;
    a.download = `acessos_${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, "0")}_${String(today.getDate()).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      setLogs(prev => prev.filter(l => l.id !== deleteTarget));
      setDeleteTarget(null);
    }
  };

  const deleteLogEntry = filtered.find(l => l.id === deleteTarget);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-[hsl(258,90%,66%)]" />
            Registro de Acesso
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Monitoramento e auditoria de acessos à plataforma</p>
        </div>
        <Button size="sm" onClick={handleExportCSV} className="bg-[hsl(152,70%,45%)] hover:bg-[hsl(152,70%,38%)] text-white gap-1.5">
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </Button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total de Acessos", value: filtered.length.toString(), color: "hsl(258,90%,66%)" },
          { label: "Usuários Únicos", value: new Set(filtered.map(l => l.userId)).size.toString(), color: "hsl(210,80%,50%)" },
          { label: "Perfis Ativos", value: new Set(filtered.map(l => l.perfil)).size.toString(), color: "hsl(152,70%,45%)" },
          { label: "Módulos Acessados", value: new Set(filtered.map(l => l.modulo)).size.toString(), color: "hsl(38,90%,55%)" },
        ].map((kpi, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Search className="w-4 h-4 text-[hsl(258,90%,66%)]" /> Filtros de Pesquisa
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nome / Login</label>
            <Input placeholder="Buscar..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(1); }} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Perfil</label>
            <Select value={filterPerfil} onValueChange={v => { setFilterPerfil(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{perfilOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tipo de Ação</label>
            <Select value={filterAcao} onValueChange={v => { setFilterAcao(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{acaoOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Módulo</label>
            <Select value={filterModulo} onValueChange={v => { setFilterModulo(v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{moduloOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Data Início</label>
            <Input type="date" value={filterDataInicio} onChange={e => setFilterDataInicio(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold">Nome</TableHead>
                <TableHead className="text-xs font-semibold">Login</TableHead>
                <TableHead className="text-xs font-semibold">Perfil</TableHead>
                <TableHead className="text-xs font-semibold">Data</TableHead>
                <TableHead className="text-xs font-semibold">Login</TableHead>
                <TableHead className="text-xs font-semibold">Logout</TableHead>
                <TableHead className="text-xs font-semibold">Tempo</TableHead>
                <TableHead className="text-xs font-semibold">Dispositivo</TableHead>
                <TableHead className="text-xs font-semibold">Ação</TableHead>
                <TableHead className="text-xs font-semibold">Módulo</TableHead>
                <TableHead className="text-xs font-semibold w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((log) => (
                <TableRow key={log.id} className="hover:bg-muted/20">
                  <TableCell className="text-xs font-medium text-foreground">{log.nome}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{log.login}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getPerfilColor(log.perfil)}`}>
                      {log.perfil}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.data}</TableCell>
                  <TableCell className="text-xs text-foreground font-mono">{log.horaLogin}</TableCell>
                  <TableCell className="text-xs text-foreground font-mono">{log.horaLogout}</TableCell>
                  <TableCell className="text-xs font-medium text-foreground">{log.tempoSessao}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`${log.navegador} • IP: ${log.ip}`}>
                      {getDeviceIcon(log.dispositivo)}
                      <span className="capitalize">{log.dispositivo}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs">
                      {getAcaoIcon(log.acao)}
                      <span className="text-foreground">{log.acao}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">{log.modulo}</span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-[hsl(0,70%,55%)]" onClick={() => setDeleteTarget(log.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum registro encontrado para os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Exibindo {((page - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} de {filtered.length} registros
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => (
              <Button key={i} variant={page === i + 1 ? "default" : "ghost"} size="icon" className={`h-7 w-7 text-xs ${page === i + 1 ? "bg-[hsl(258,90%,66%)] text-white" : ""}`} onClick={() => setPage(i + 1)}>
                {i + 1}
              </Button>
            ))}
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Info footer */}
      <div className="bg-muted/30 rounded-xl border border-border p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-[hsl(258,90%,66%)] mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Política de Segurança & Compliance</p>
          <p>• Registros são persistentes e não podem ser alterados ou excluídos manualmente.</p>
          <p>• Dados criptografados e auditáveis em conformidade com a LGPD.</p>
          <p>• Acesso restrito ao perfil Gestor IA / Administrador.</p>
          <p>• Retenção configurável: 12, 24 ou 60 meses.</p>
        </div>
      </div>

      {/* Delete Confirmacaotion Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[hsl(0,70%,55%)]">
              <Trash2 className="w-5 h-5" /> Confirmacaor Exclusão
            </DialogTitle>
          </DialogHeader>
          {deleteLogEntry && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Tem certeza que deseja excluir permanentemente este registro de acesso?</p>
              <div className="bg-muted/30 rounded-lg border border-border p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Usuário:</span><span className="font-medium text-foreground">{deleteLogEntry.nome}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Data:</span><span className="font-medium text-foreground">{deleteLogEntry.data} às {deleteLogEntry.horaLogin}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ação:</span><span className="font-medium text-foreground">{deleteLogEntry.acao}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Módulo:</span><span className="font-medium text-foreground">{deleteLogEntry.modulo}</span></div>
              </div>
              <p className="text-xs text-[hsl(0,70%,55%)] font-medium">⚠ Esta ação é irreversível.</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button size="sm" className="bg-[hsl(0,70%,55%)] hover:bg-[hsl(0,70%,45%)] text-white" onClick={handleDeleteConfirm}>Excluir Registro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TabRegistroAcesso;
