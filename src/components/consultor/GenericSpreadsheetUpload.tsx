import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/services/prospeccaoService";

interface Item { 
  name: string; 
  status: "enviando" | "ok" | "erro"; 
  rows?: number; 
  error?: string; 
}

export default function GenericSpreadsheetUpload({ 
  onComplete,
  title = "Upload de Planilha",
  acceptedFileTypes = ".xlsx,.csv"
}: { 
  onComplete?: () => void;
  title?: string;
  acceptedFileTypes?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    for (const file of Array.from(files)) {
      const item: Item = { name: file.name, status: "enviando" };
      setItems(prev => [item, ...prev]);
      
      try {
        const r = await uploadFile(file);
        setItems(prev => prev.map(i => i === item ? { ...i, status: "ok", rows: r.rows } : i));
        
        toast({
          title: "Upload concluído",
          description: `${file.name} processado com sucesso. ${r.rows} linhas importadas.`,
        });
        
        if (onComplete) onComplete();
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        setItems(prev => prev.map(i => i === item ? { ...i, status: "erro", error: msg } : i));
        toast({ 
          title: `Falha ao enviar ${file.name}`, 
          description: msg, 
          variant: "destructive" 
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-none shadow-none bg-transparent">
        <CardContent className="p-0 space-y-3">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-10 cursor-pointer hover:bg-muted/30 transition bg-white"
          >
            <Upload className="w-10 h-10 text-muted-foreground" />
            <div className="text-sm font-semibold">Clique ou arraste a planilha aqui</div>
            <div className="text-xs text-muted-foreground">XLSX ou CSV — até 20 MB</div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={acceptedFileTypes}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>

          {items.length > 0 && (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded border bg-white shadow-sm">
                  {it.status === "enviando" && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                  {it.status === "ok" && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                  {it.status === "erro" && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  <span className="font-medium truncate flex-1">{it.name}</span>
                  {it.status === "ok" && <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{it.rows} linhas</span>}
                  {it.status === "erro" && <span className="text-red-600 truncate max-w-[200px]" title={it.error}>{it.error}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
