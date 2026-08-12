import { useState, useMemo } from "react";
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
  FileSpreadsheet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import VirtualTable from "@/components/shared/VirtualTable";
import GenericSpreadsheetUpload from "@/components/consultor/GenericSpreadsheetUpload";
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
      { key: "data_distribuicao", header: "Data Distribuição" },
      { key: "numero_processo", header: "Nº Processo" },
      { key: "empresa", header: "Empresa" },
      { key: "aj_nomeado", header: "AJ Nomeado" },
      { key: "magistrado_nome", header: "Juiz / Juíza" },
    ]
  },
  "AGCS_REALIZADAS": {
    title: "AGCs Realizadas",
    columns: [
      { key: "cliente", header: "Cliente" },
      { key: "recuperanda", header: "Recuperanda" },
      { key: "data_agc", header: "Data AGC" },
      { key: "cidade", header: "Cidade" },
      { key: "estado", header: "Estado" },
    ]
  },
  "CADASTRO_AJ": {
    title: "Cadastro de Administradores Judiciais",
    columns: [
      { key: "nome", header: "Nome" },
      { key: "sigla", header: "Sigla" },
      { key: "email", header: "E-mail" },
      { key: "telefone", header: "Telefone" },
      { key: "cidade", header: "Cidade" },
    ]
  },
  "CARTAS_AJ": {
    title: "Relação de Cartas Impressas aos AJ",
    columns: [
      { key: "data_distribuicao", header: "Data Distribuição" },
      { key: "cliente", header: "Cliente" },
      { key: "processo", header: "Processo" },
      { key: "sigla", header: "Sigla" },
      { key: "status", header: "Status" },
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
          data_distribuicao: l.dt_inicio || l.data_distribuicao,
          numero_processo: l.numero_processo,
          empresa: l.parte_pro_nome,
          recuperanda: l.parte_pro_nome,
          aj_nomeado: l.advogado_nome,
          magistrado_nome: l.pedidos_principais?.includes("Juiz:") ? l.pedidos_principais.split("|")[0].replace("Juiz:", "").trim() : l.pedidos_principais,
          cliente: l.parte_con_nome,
          data_agc: l.dt_inicio, // Simplificação
          cidade: l.municipio,
          estado: l.uf,
          nome: l.advogado_nome,
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
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Filtros Avançados
            </Button>
            <Button variant="outline" size="sm" className="gap-2 text-green-600 border-green-200 bg-green-50">
              <Download className="w-4 h-4" />
              Exportar Excel
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden min-h-[400px]">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileSpreadsheet className="w-12 h-12 mb-4 opacity-20" />
              <p>Nenhum registro encontrado para este arquivo.</p>
              <Button variant="link" onClick={handleUpload} className="text-primary mt-2">
                Fazer primeiro upload
              </Button>
            </div>
          ) : (
            <VirtualTable
              data={rows}
              columns={tableColumns}
              rowKey={(r) => r.id}
              maxHeight={600}
              headerClassName="bg-gray-50 text-gray-500 font-medium border-b"
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
