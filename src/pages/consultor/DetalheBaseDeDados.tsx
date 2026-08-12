import { useState, useEffect } from "react";
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
  History,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import VirtualTable from "@/components/shared/VirtualTable";
import { SpreadsheetUpload } from "@/components/prospeccao/SpreadsheetUpload";
import AdvancedFilters from "@/components/consultor/AdvancedFilters";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DATASET_CONFIGS, DatasetType } from "@/config/datasets";
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
import { Badge } from "@/components/ui/badge";

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
  
  const datasetType = code as DatasetType;
  const config = DATASET_CONFIGS[datasetType];

  useEffect(() => {
    if (!config) return;

    async function loadData() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from(config.tableName as any)
          .select("*")
          .order('created_at', { ascending: false });

        if (error) throw error;
        setRows(data || []);
      } catch (e) {
        console.error("Erro ao carregar dados:", e);
        toast({
          title: "Erro ao carregar dados",
          description: "Não foi possível sincronizar com o banco de dados.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [code, refreshKey, config]);

  if (!config) {
    return (
      <ConsultorPageShell 
        title="Arquivo não encontrado"
        subtitle="Verifique o código da base de dados"
        kpis={[]}
      >

        <div className="flex flex-col items-center justify-center py-20">
          <Info className="w-12 h-12 text-slate-300 mb-4" />
          <p className="text-slate-500">A base de dados selecionada não existe ou foi removida.</p>
          <Button variant="link" onClick={() => navigate("/consultor/base-de-dados")}>
            Voltar para Base de Dados
          </Button>
        </div>
      </ConsultorPageShell>
    );
  }

  const handleUploadComplete = () => {
    setRefreshKey(prev => prev + 1);
    setIsUploadOpen(false);
  };

  const handleDelete = (id: string) => {
    setIsDeleting(id);
  };

  const confirmDelete = async () => {
    try {
      const { error } = await supabase
        .from(config.tableName as any)
        .delete()
        .eq('id', isDeleting);

      if (error) throw error;

      toast({
        title: "Registro removido",
        description: "O registro foi excluído com sucesso da base de dados.",
      });
      setRefreshKey(prev => prev + 1);
    } catch (e) {
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o registro.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const tableColumns = [
    ...config.columns.map(col => ({
      key: col.key,
      header: col.header,
      cell: (r: any) => col.format ? col.format(r[col.key]) : r[col.key] || "—"
    })),
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
      subtitle="Sincronização Enterprise MD-BEX-001 ativada com reconciliação automática."
      kpis={[
        { label: "Total de Registros", value: rows.length, icon: FileSpreadsheet, tone: "blue" },
        { label: "Sincronizados", value: rows.length, icon: History, tone: "green" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/consultor/base-de-dados")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
          <SpreadsheetUpload datasetType={datasetType} onSuccess={handleUploadComplete} />
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
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground flex-1 text-center px-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <FileSpreadsheet className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-semibold text-slate-700">Nenhum registro sincronizado</p>
              <p className="text-sm text-slate-500 max-w-xs mt-1">Carregue sua planilha oficial para iniciar o processo de reconciliação e análise.</p>
              <div className="mt-6">
                <SpreadsheetUpload datasetType={datasetType} onSuccess={handleUploadComplete} />
              </div>
            </div>
          ) : (
            <VirtualTable
              data={rows.filter(r => {
                const searchMatch = !search || Object.values(r).some(v => 
                  String(v || "").toLowerCase().includes(search.toLowerCase())
                );
                
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
