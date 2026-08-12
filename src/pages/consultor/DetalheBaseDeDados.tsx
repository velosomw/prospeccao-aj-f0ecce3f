import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { 
  Search, 
  Filter, 
  Upload, 
  Download, 
  Edit2, 
  Trash2, 
  ArrowLeft,
  FileSpreadsheet,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import VirtualTable from "@/components/shared/VirtualTable";
import GenericSpreadsheetUpload from "@/components/consultor/GenericSpreadsheetUpload";
import AdvancedFilters from "@/components/consultor/AdvancedFilters";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mock data mapping based on the requirement
const FILE_CONFIGS: Record<string, { title: string; columns: any[] }> = {
  "AJ_NOMEADOS": {
    title: "Administradores Judiciais Nomeados e Não Nomeados",
    columns: [
      { key: "data_distribuicao", header: "Data Distribuição", cell: (r: any) => r.data_distribuicao },
      { key: "mes_referencia", header: "Mês", cell: (r: any) => r.mes_referencia },
      { key: "numero_processo", header: "Nº Processo", cell: (r: any) => r.numero_processo },
      { key: "empresa", header: "Empresa", cell: (r: any) => r.empresa },
      { key: "orgao_tribunal", header: "Vara e Comarca", cell: (r: any) => r.orgao_tribunal },
      { key: "uf", header: "Estado", cell: (r: any) => r.uf },
      { key: "valor_pleito", header: "Valor Passivo", cell: (r: any) => r.valor_pleito?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || "—" },
      { key: "aj_nomeado", header: "AJ Nomeado", cell: (r: any) => r.aj_nomeado },
      { key: "magistrado_nome", header: "Juiz / Juíza", cell: (r: any) => r.magistrado_nome },
    ]
  },
  "AGCS_REALIZADAS": {
    title: "AGCs Realizadas",
    columns: [
      { key: "cliente", header: "Cliente", cell: (r: any) => r.cliente },
      { key: "recuperanda", header: "Recuperanda", cell: (r: any) => r.recuperanda },
      { key: "data_agc", header: "Data AGC", cell: (r: any) => r.data_agc },
      { key: "mes_referencia", header: "Mês", cell: (r: any) => r.mes_referencia },
      { key: "cidade", header: "Cidade", cell: (r: any) => r.cidade },
      { key: "uf", header: "Estado", cell: (r: any) => r.uf },
    ]
  },
  "CADASTRO_AJ": {
    title: "Cadastro de Administradores Judiciais",
    columns: [
      { key: "nome", header: "Administrador / Escritório", cell: (r: any) => r.nome },
      { key: "sigla", header: "Sigla", cell: (r: any) => r.sigla },
      { key: "contato", header: "Contato", cell: (r: any) => r.contato },
      { key: "email", header: "E-mail", cell: (r: any) => r.email },
      { key: "telefone", header: "Telefone", cell: (r: any) => r.telefone },
      { key: "cidade", header: "Cidade", cell: (r: any) => r.cidade },
      { key: "uf", header: "UF", cell: (r: any) => r.uf },
    ]
  },
  "CARTAS_AJ": {
    title: "Relação de Cartas Impressas aos AJ",
    columns: [
      { key: "data_distribuicao", header: "Data Distribuição", cell: (r: any) => r.data_distribuicao },
      { key: "mes_referencia", header: "Mês", cell: (r: any) => r.mes_referencia },
      { key: "cliente", header: "Cliente", cell: (r: any) => r.cliente },
      { key: "processo", header: "Processo", cell: (r: any) => r.processo },
      { key: "contato", header: "Administrador (Contato)", cell: (r: any) => r.contato },
      { key: "sigla", header: "Sigla", cell: (r: any) => r.sigla },
      { key: "status", header: "Status", cell: (r: any) => r.status },
    ]
  }
};

export default function DetalheBaseDeDados() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const config = FILE_CONFIGS[code || ""] || { title: "Arquivo não encontrado", columns: [] };

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const { listLinhas } = await import("@/services/prospeccaoService");
        const allLinhas = await listLinhas();
        
        // Mapear ProspeccaoLinha para o formato esperado pela tabela
        const mapped = allLinhas.map(l => ({
          id: l.id,
          data_distribuicao: l.data_distribuicao || l.dt_inicio,
          mes_referencia: l.mes_referencia,
          numero_processo: l.numero_processo,
          empresa: l.parte_pro_nome,
          orgao_tribunal: l.orgao_tribunal,
          uf: l.uf,
          valor_pleito: l.valor_pleito,
          aj_nomeado: l.advogado_nome,
          magistrado_nome: l.pedidos_principais?.includes("Juiz:") ? l.pedidos_principais.split("|")[0].replace("Juiz:", "").trim() : l.pedidos_principais,
          // Mapeamento dinâmico baseado no conteúdo real das colunas importadas
          recuperanda: l.parte_pro_nome,
          cliente: l.parte_con_nome,
          data_agc: l.dt_inicio,
          cidade: l.municipio,
          nome: l.parte_con_nome || l.advogado_nome, // Para Cadastro AJ o nome costuma vir em Clientes ou Advogado
          contato: l.pedidos_principais || l.advogado_nome, // Usado para nome do DR./Contato
          sigla: l.denominacao,
          email: l.link_documento,
          telefone: l.advogado_oab,
          processo: l.numero_processo,
          status: l.status_processo,
        }));
        setRows(mapped);
      } catch (e) {
        console.error("Erro ao carregar dados:", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [code, refreshKey]);

  const handleUpload = () => {
    setIsUploadOpen(true);
  };

  const handleUploadComplete = () => {
    setRefreshKey(prev => prev + 1);
    // Ideally we would also re-fetch the data here
  };

  const handleDelete = (id: string) => {
    setIsDeleting(id);
  };

  const confirmDelete = () => {
    toast({
      title: "Registro removido",
      description: "O registro foi excluído com sucesso da base de dados.",
    });
    setIsDeleting(null);
  };

  const tableColumns = [
    ...config.columns,
    {
      key: "acoes",
      header: <span className="text-right w-full block">Ações</span>,
      cell: (r: any) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-600">
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0 text-red-600"
            onClick={() => handleDelete(r.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      className: "text-right",
    }
  ];

  return (
    <ConsultorPageShell
      title={config.title}
      subtitle="Gerencie, edite e adicione informações diretamente nesta base de dados."
      kpis={[
        { label: "Total de Registros", value: rows.length, icon: FileSpreadsheet, tone: "blue" },
        { label: "Filtrados", value: 0, icon: Search, tone: "purple" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/consultor/base-de-dados")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <Button size="sm" onClick={handleUpload} className="gap-2 bg-[hsl(217,91%,50%)]">
            <Upload className="w-4 h-4" />
            Upload dados
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Busca por palavras-chave..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Button 
              variant={isFiltersOpen ? "secondary" : "outline"} 
              size="sm" 
              className={`gap-2 ${isFiltersOpen ? 'bg-blue-50 text-blue-600 border-blue-200' : ''}`}
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            >
              <Filter className="w-4 h-4" />
              {isFiltersOpen ? "Fechar Filtros" : "Filtros Avançados"}
            </Button>
            <Button variant="outline" size="sm" className="gap-2 text-green-600 border-green-200 bg-green-50">
              <Download className="w-4 h-4" />
              Exportar Excel
            </Button>
          </div>
        </div>
        
        {isFiltersOpen && (
          <AdvancedFilters 
            columns={config.columns} 
            onFilterChange={setColumnFilters}
            onClose={() => setIsFiltersOpen(false)}
          />
        )}

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden min-h-[400px] flex flex-col">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground flex-1">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
              <p>Carregando registros...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground flex-1">
              <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
              <p>Nenhum registro encontrado para este arquivo.</p>
              <Button variant="link" onClick={handleUpload} className="text-primary mt-2">
                Fazer primeiro upload
              </Button>
            </div>
          ) : (
            <VirtualTable
              data={rows.filter(r => {
                // Filtro de busca global
                const searchMatch = !search || Object.values(r).some(v => 
                  String(v || "").toLowerCase().includes(search.toLowerCase())
                );
                
                // Filtros por coluna
                const columnMatch = Object.entries(columnFilters).every(([key, value]) => {
                  if (!value) return true;
                  const rowValue = String(r[key] || "").toLowerCase();
                  return rowValue.includes(value.toLowerCase());
                });

                return searchMatch && columnMatch;
              })}
              columns={tableColumns}
              rowKey={(r) => r.id}
              maxHeight={600}
              headerClassName="bg-[hsl(222,47%,14%)] text-white font-medium border-b"
              rowClassName="border-b border-border/60 hover:bg-blue-50/50 transition-colors"
            />
          )}
        </div>
      </div>

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload de Dados: {config.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <GenericSpreadsheetUpload onComplete={handleUploadComplete} />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!isDeleting} onOpenChange={() => setIsDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro será removido permanentemente da base de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConsultorPageShell>
  );
}
