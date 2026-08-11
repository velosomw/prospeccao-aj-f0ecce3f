import { useState, useEffect } from "react";
import ConsultorPageShell from "@/components/consultor/PageShell";
import { 
  Database, 
  Search, 
  Filter, 
  ArrowUpDown, 
  FileSpreadsheet, 
  Download, 
  RefreshCcw, 
  History, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  MoreVertical,
  Calendar,
  User,
  ExternalLink
} from "lucide-react";
import { databaseExportService, ExportDefinition } from "@/services/databaseExportService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const StatusBadge = ({ status }: { status: ExportDefinition['status'] }) => {
  const configs = {
    AVAILABLE: { label: "Disponível", className: "bg-green-100 text-green-700 border-green-200" },
    SUCCESS: { label: "Atualizado", className: "bg-green-100 text-green-700 border-green-200" },
    OUTDATED: { label: "Desatualizado", className: "bg-amber-100 text-amber-700 border-amber-200" },
    GENERATING: { label: "Atualizando", className: "bg-blue-100 text-blue-700 border-blue-200 animate-pulse" },
    ERROR: { label: "Erro", className: "bg-red-100 text-red-700 border-red-200" },
    NO_DATA: { label: "Sem dados", className: "bg-gray-100 text-gray-700 border-gray-200" },
  };

  const config = configs[status] || configs.NO_DATA;

  return (
    <Badge variant="outline" className={`${config.className} font-medium`}>
      {config.label}
    </Badge>
  );
};

export default function BaseDeDados() {
  const [search, setSearch] = useState("");
  const [definitions, setDefinitions] = useState<ExportDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = async () => {
    try {
      const data = await databaseExportService.getDefinitions();
      setDefinitions(data);
    } catch (error) {
      console.error("Error loading definitions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Poll every 5 seconds while on page
    return () => clearInterval(interval);
  }, []);

  const handleUpdateAndDownload = async (code: string) => {
    try {
      toast({
        title: "Geração iniciada",
        description: "O arquivo está sendo preparado e o download começará em instantes.",
      });
      await databaseExportService.generateExport(code);
      // Simulate backend processing for UX
      setTimeout(loadData, 2000);
    } catch (error) {
      toast({
        title: "Erro na geração",
        description: "Não foi possível iniciar a atualização do arquivo.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadLatest = async (code: string) => {
    try {
      await databaseExportService.downloadLatest(code);
      toast({
        title: "Download iniciado",
        description: "A última versão válida está sendo baixada.",
      });
    } catch (error) {
      toast({
        title: "Arquivo não encontrado",
        description: "Gere uma nova versão antes de baixar.",
        variant: "destructive",
      });
    }
  };

  const kpis = [
    { 
      label: "Arquivos disponíveis", 
      value: definitions.length, 
      hint: "Tipos de exportação", 
      icon: FileSpreadsheet, 
      tone: "blue" as const 
    },
    { 
      label: "Arquivos atualizados", 
      value: definitions.filter(d => d.status === 'SUCCESS' || d.status === 'AVAILABLE').length, 
      hint: "Versão mais recente", 
      icon: CheckCircle2, 
      tone: "green" as const 
    },
    { 
      label: "Último download", 
      value: definitions.some(d => d.last_download_at) 
        ? format(new Date(Math.max(...definitions.filter(d => d.last_download_at).map(d => new Date(d.last_download_at!).getTime()))), "dd/MM HH:mm")
        : "Nenhum", 
      hint: "Geral da platafoprospecção", 
      icon: Clock, 
      tone: "orange" as const 
    },
    { 
      label: "Total de registros", 
      value: definitions.reduce((acc, d) => acc + d.record_count, 0).toLocaleString('pt-BR'), 
      hint: "Volume exportável", 
      icon: Database, 
      tone: "purple" as const 
    },
  ];

  return (
    <ConsultorPageShell
      title="Base de Dados"
      subtitle="Atualize e exporte bases consolidadas da platafoprospecção em arquivos Excel padronizados."
      search={search}
      onSearch={setSearch}
      kpis={kpis}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <History className="w-4 h-4" />
            Histórico
          </Button>
          <Button className="gap-2 bg-[hsl(217,91%,50%)] hover:bg-[hsl(217,91%,45%)]">
            <RefreshCcw className="w-4 h-4" />
            Atualizar todos
          </Button>
        </div>
      }
    >
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500 font-medium">
                <th className="px-6 py-4">Arquivo</th>
                <th className="px-6 py-4">Registros</th>
                <th className="px-6 py-4">Última atualização</th>
                <th className="px-6 py-4">Último download</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                    Carregando definições de exportação...
                  </td>
                </tr>
              ) : definitions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                    Nenhum tipo de exportação configurado.
                  </td>
                </tr>
              ) : (
                definitions
                  .filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
                  .map((def) => (
                  <tr key={def.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-gray-900">{def.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{def.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-600">
                      {def.record_count.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {def.last_updated_at ? (
                        <div className="flex flex-col">
                          <span>{format(new Date(def.last_updated_at), "dd/MM/yyyy HH:mm")}</span>
                          <span className="text-[10px] text-gray-400">por {def.updated_by_name || "Sistema"}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">Nunca</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {def.last_download_at ? (
                        <div className="flex items-center gap-1.5">
                          <Download className="w-3.5 h-3.5 text-gray-400" />
                          <span>{format(new Date(def.last_download_at), "dd/MM HH:mm")}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">Nenhum</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={def.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => handleUpdateAndDownload(def.code)}
                          disabled={def.status === 'GENERATING'}
                        >
                          {def.status === 'GENERATING' ? (
                            <RefreshCcw className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="w-4 h-4" />
                          )}
                          Atualizar e baixar
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              className="gap-2"
                              onClick={() => handleDownloadLatest(def.code)}
                            >
                              <Download className="w-4 h-4" />
                              Baixar última versão
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                              <History className="w-4 h-4" />
                              Ver histórico
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-blue-600">
                              <ExternalLink className="w-4 h-4" />
                              Configurar modelo
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ConsultorPageShell>
  );
}