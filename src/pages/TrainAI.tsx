// Página dedicada "Upload Planilha" — fora do Prospecção Workspace.
import { useEffect, useMemo, useState } from "react";
import PlatformLayout from "@/components/PlatformLayout";
import TrainAITab from "@/components/prospecção/TrainAITab";
import LearningUploadPanel from "@/components/workspace/stages/LearningUploadPanel";
import ErrorFilesPanel from "@/components/prospecção/training/ErrorFilesPanel";
import ProspeccaoUploadCard from "@/components/prospeccao/ProspeccaoUploadCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Search, GraduationCap, FileWarning, Upload, FolderTree, Clock } from "lucide-react";
import OneDriveFoldersStatus from "@/components/workspace/OneDriveFoldersStatus";
import { listMyAssignedCompanies, listCompanies, type Company } from "@/services/companiesService";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useToast } from "@/hooks/use-toast";

type ViewMode = "treinar" | "erros" | "upload" | "worker";





export default function TrainAI() {
  const { roles } = useUserRoles();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("upload");


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const isAdmin = roles.includes("gestor_ia") || roles.includes("coordenador");
        const data = isAdmin ? await listCompanies() : await listMyAssignedCompanies();
        const merged = data || [];
        if (!cancelled) setCompanies(merged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roles]);

  // Lista única de empresas (por nome) para o primeiro seletor
  const companyNames = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const names = new Set<string>();
    companies.forEach(c => {
      const name = c.name || "";
      if (!name) return;
      if (q && !name.toLowerCase().includes(q) && !(c.prospecção_id || "").toLowerCase().includes(q)) return;
      names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [companies, filter]);

  // Prospecçãos vinculados à empresa selecionada
  const prospecçãosOfCompany = useMemo(() => {
    if (!companyName) return [];
    return companies.filter(c => c.name === companyName);
  }, [companies, companyName]);

  // Reset Prospecção quando troca empresa
  useEffect(() => {
    setCompanyId(null);
  }, [companyName]);

  const selected = companies.find(c => c.id === companyId) || null;

  return (
    <PlatformLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[hsl(217,91%,50%)] flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Upload Planilha</h1>
            <p className="text-sm text-muted-foreground">
              Carregamento de base de dados e prospecção ativa. A IA processará automaticamente os links de documentos encontrados.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Selecione a Planilha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-3">
              <div>
                <Label className="text-xs">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7"
                    placeholder="Empresa ou código da planilha"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Empresa</Label>
                <Select value={companyName ?? ""} onValueChange={(v) => setCompanyName(v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? "Carregando..." : "Escolha uma empresa"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {companyNames.length === 0 && (
                      <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                        Nenhuma empresa encontrada.
                      </div>
                    )}
                    {companyNames.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Planilha de upload</Label>
                <Select
                  value={companyId ?? ""}
                  onValueChange={(v) => setCompanyId(v || null)}
                  disabled={!companyName}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={!companyName ? "Selecione a empresa primeiro" : "Arquivo"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {prospecçãosOfCompany.length === 0 && (
                      <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                        Nenhuma planilha vinculada.
                      </div>
                    )}
                    {prospecçãosOfCompany.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        Arquivo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {companyId ? (
          <div className="space-y-4">
            <ProspeccaoUploadCard 
              companyId={companyId} 
              onComplete={() => {
                toast({ title: "Upload concluído", description: "O processamento dos dados foi iniciado." });
              }} 
            />
            
            <div className="flex items-center gap-1 border-b">
              {([
                { id: "upload", label: "Monitoramento Processamento", Icon: Upload },
                { id: "erros", label: "Falhas de Extração", Icon: FileWarning },
              ] as { id: ViewMode; label: string; Icon: typeof FileWarning }[]).map(t => {
                const active = view === t.id || (view === "worker" && t.id === "upload");
                return (
                  <button
                    key={t.id}
                    onClick={() => setView(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm border-b-2 transition ${
                      active
                        ? "border-[hsl(217,91%,50%)] text-[hsl(217,91%,50%)] font-semibold"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <t.Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {view === "erros" ? (
              <ErrorFilesPanel
                prospecçãoId={selected?.prospecção_id || companyId}
                companyId={companyId}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4 text-orange-500" /> Fila de Extração IA
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-4">
                      Acompanhe o status dos documentos em fila para extração cognitiva.
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] p-2 bg-muted/30 rounded">
                        <span>Status: Conectado ao Gemini 1.5 Flash</span>
                        <span className="text-green-600 font-semibold uppercase">Ativo</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <OneDriveFoldersStatus
                  companyId={companyId}
                  ano={selected?.execution_year ?? null}
                  mes={selected?.current_period_month ?? null}
                  lockMonth
                />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-20 bg-muted/10 border border-dashed rounded-xl">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Pronto para processar</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1">
              Selecione a Empresa de Prospecção acima para habilitar o painel de upload e extração.
            </p>
          </div>
        )}

      </div>
    </PlatformLayout>
  );
}
