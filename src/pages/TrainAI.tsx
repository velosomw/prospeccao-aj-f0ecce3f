// Página dedicada "Upload Planilha" — fora do RMA Workspace.
import { useEffect, useMemo, useState } from "react";
import PlatformLayout from "@/components/PlatformLayout";
import TrainAITab from "@/components/rma/TrainAITab";
import LearningUploadPanel from "@/components/workspace/stages/LearningUploadPanel";
import ErrorFilesPanel from "@/components/rma/training/ErrorFilesPanel";
import ProspeccaoUploadCard from "@/components/prospeccao/ProspeccaoUploadCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Search, GraduationCap, FileWarning, Upload, FolderTree } from "lucide-react";
import OneDriveFoldersStatus from "@/components/workspace/OneDriveFoldersStatus";
import { listMyAssignedCompanies, listCompanies, type Company } from "@/services/companiesService";
import { useUserRoles } from "@/hooks/useUserRoles";

type ViewMode = "treinar" | "erros" | "upload" | "worker";

// Empresa demo cadastrada localmente (E-XYON) com planilha fixa.
const DEMO_COMPANY: Company = {
  id: "demo-exyon",
  name: "E-XYON",
  rma_id: "Arquivo E-XYON-JUNHO-2026",
  execution_year: 2026,
  current_period_month: 6,
} as unknown as Company;




export default function TrainAI() {
  const { roles } = useUserRoles();
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
        const merged = [DEMO_COMPANY, ...(data || [])];
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
      if (q && !name.toLowerCase().includes(q) && !(c.rma_id || "").toLowerCase().includes(q)) return;
      names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [companies, filter]);

  // RMAs vinculados à empresa selecionada
  const rmasOfCompany = useMemo(() => {
    if (!companyName) return [];
    return companies.filter(c => c.name === companyName);
  }, [companies, companyName]);

  // Reset RMA quando troca empresa
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
              Carregue a planilha da empresa e as informações de referência para processamento.
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
                    {rmasOfCompany.length === 0 && (
                      <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                        Nenhuma planilha vinculada.
                      </div>
                    )}
                    {rmasOfCompany.map(c => (
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

        {companyId === DEMO_COMPANY.id ? (
          <ProspeccaoUploadCard />
        ) : companyId ? (
          <>
            {/* Menu inline */}
            <div className="flex items-center gap-1 border-b">
              {([
                { id: "erros", label: "Arquivos com erro", Icon: FileWarning },
                { id: "upload", label: "Aprendizado IA · Upload Manual", Icon: Upload },
                { id: "treinar", label: "Corrigir gabaritos", Icon: GraduationCap },
                { id: "worker", label: "Worker OneDrive", Icon: FolderTree },
              ] as { id: ViewMode; label: string; Icon: typeof FileWarning }[]).map(t => {
                const active = view === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setView(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition ${
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

            {view === "erros" && (
              <ErrorFilesPanel
                rmaId={selected?.rma_id || companyId}
                companyId={companyId}
              />
            )}
            {view === "upload" && (
              <LearningUploadPanel
                rmaId={selected?.rma_id || companyId}
                companyId={companyId}
                maxFiles={10}
                lockedYear={selected?.execution_year ?? null}
                lockedMonth={selected?.current_period_month ?? null}
              />
            )}
            {view === "treinar" && (
              <TrainAITab companyId={companyId} rmaId={selected?.rma_id || undefined} />
            )}
            {view === "worker" && (
              <OneDriveFoldersStatus
                companyId={companyId}
                ano={selected?.execution_year ?? null}
                mes={selected?.current_period_month ?? null}
                lockMonth
              />
            )}
          </>
        ) : (
          <div className="text-center text-sm text-muted-foreground border border-dashed rounded-lg p-10">
            Selecione uma planilha acima para iniciar o upload e o processamento.
          </div>
        )}

      </div>
    </PlatformLayout>
  );
}
