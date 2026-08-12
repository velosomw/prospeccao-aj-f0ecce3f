import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, CheckCircle, AlertCircle, Loader2, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SpreadsheetUploadProps {
  datasetType?: string;
  onSuccess?: (batchId: string) => void;
}

export function SpreadsheetUpload({ datasetType, onSuccess }: SpreadsheetUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Item 18: Extension validation
    const allowedExtensions = ["xlsx", "xls", "csv"];
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      toast({
        title: "Arquivo inválido",
        description: "Apenas arquivos Excel (.xlsx, .xls) ou CSV são permitidos.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUploading(true);
      setProgress(10);

      // 1. Upload to storage
      const fileName = `${crypto.randomUUID()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("prospeccao-uploads")
        .upload(fileName, file);

      if (uploadError) throw uploadError;
      setProgress(40);

      // 2. Trigger processing edge function
      const { data: processData, error: processError } = await supabase.functions.invoke(
        "prospeccao-upload",
        {
          body: {
            storage_path: uploadData.path,
            file_name: file.name,
            file_type: extension,
            dataset_type: datasetType,
          },
        }
      );

      if (processError) throw processError;
      setProgress(100);

      const results = processData.results;
      toast({
        title: "Importação concluída",
        description: `Inseridos: ${results.inserted}, Atualizados: ${results.updated}, Sem alterações: ${results.unchanged}`,
      });

      if (onSuccess) onSuccess(processData.batch_id);
      setOpen(false);
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Erro no processamento",
        description: error.message || "Ocorreu um erro ao processar sua planilha.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#10b981] hover:bg-[#059669] text-white gap-2 font-medium">
          <Upload className="w-4 h-4" />
          Sincronizar Planilha
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-[#10b981]" />
            Sincronização Enterprise
          </DialogTitle>
        </DialogHeader>

        <div className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
          {!isUploading ? (
            <>
              <input
                type="file"
                id="spreadsheet-upload"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
              />
              <label
                htmlFor="spreadsheet-upload"
                className="cursor-pointer flex flex-col items-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 border border-slate-100">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">Clique para selecionar</p>
                  <p className="text-xs text-slate-500 mt-1">XLSX, XLS ou CSV</p>
                </div>
              </label>
            </>
          ) : (
            <div className="w-full px-8 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 font-medium">Processando dados...</span>
                <span className="text-[#10b981] font-bold">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2 bg-slate-200" />
              <p className="text-[10px] text-center text-slate-400 uppercase tracking-wider font-semibold">
                Executando Reconciliação MD-BEX-001
              </p>
            </div>
          )}
        </div>

        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100/50">
          <div className="flex gap-3">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-blue-900">Regras de Reconciliação:</p>
              <ul className="text-[11px] text-blue-800/80 list-disc list-inside space-y-0.5">
                <li>Registros novos serão criados automaticamente.</li>
                <li>Dados do Excel substituem campos da plataforma.</li>
                <li>Campos vazios no Excel preservam os dados existentes.</li>
                <li>Todas as alterações são auditadas no log do sistema.</li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
