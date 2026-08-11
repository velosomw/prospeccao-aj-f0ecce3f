import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserProvider } from "./contexts/UserContext";
import Layout from "./components/Layout";
import Index from "./pages/Index";
import ScrollToTop from "./components/ScrollToTop";
import ProtectedRoute from "./components/ProtectedRoute";
import { useUserRoles } from "./hooks/useUserRoles";

// Lazy-loaded route chunks (only Index stays eager)
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const RoleSelection = lazy(() => import("./pages/RoleSelection"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const EmpresaDashboard = lazy(() => import("./pages/EmpresaDashboard"));
const ConsultorDashboard = lazy(() => import("./pages/ConsultorDashboard"));
const ConsultorHome = lazy(() => import("./pages/consultor/ConsultorHome"));
const ConsultorProspecçãos = lazy(() => import("./pages/consultor/ConsultorProspecçãos"));
const ConsultorProcessos = lazy(() => import("./pages/consultor/ConsultorProcessos"));
const ConsultorPendencias = lazy(() => import("./pages/consultor/ConsultorPendencias"));
const ConsultorRelatorios = lazy(() => import("./pages/consultor/ConsultorRelatorios"));
const PlanilhaPadraoProspeccao = lazy(() => import("./pages/consultor/PlanilhaPadraoProspeccao"));
const ConsultorHistorico = lazy(() => import("./pages/consultor/ConsultorHistorico"));
const ConsultorLogsIA = lazy(() => import("./pages/consultor/ConsultorLogsIA"));
const ConsultorClientes = lazy(() => import("./pages/consultor/ConsultorClientes"));
const ConsultorCadastro = lazy(() => import("./pages/consultor/ConsultorCadastro"));
const ConsultorCadastroAJ = lazy(() => import("./pages/consultor/ConsultorCadastroAJ"));
const ConsultorCadastroRec = lazy(() => import("./pages/consultor/ConsultorCadastroRec"));
const ConsultorCadastroMag = lazy(() => import("./pages/consultor/ConsultorCadastroMag"));
const ConsultorCadastroTecnicos = lazy(() => import("./pages/consultor/ConsultorCadastroTecnicos"));
const CoordCadastroPerfis = lazy(() => import("./pages/coordenador/CoordCadastroPerfis"));
const CoordCadastroPerfilPage = lazy(() => import("./pages/coordenador/CoordCadastroPerfilPage"));

const ConsultorConfiguracoes = lazy(() => import("./pages/consultor/ConsultorConfiguracoes"));
const BaseDeDados = lazy(() => import("./pages/consultor/BaseDeDados"));
const HomologacaoIA = lazy(() => import("./pages/consultor/HomologacaoIA"));
const CertificacaoLive = lazy(() => import("./pages/consultor/CertificacaoLive"));
const CoordEquipe = lazy(() => import("./pages/coordenador/CoordEquipe"));
const CoordDashboardAnalitico = lazy(() => import("./pages/coordenador/CoordDashboardAnalitico"));
const CoordAprovacoes = lazy(() => import("./pages/coordenador/CoordAprovacoes"));
const CoordEmpresas = lazy(() => import("./pages/coordenador/CoordEmpresas"));
const CoordRelatorios = lazy(() => import("./pages/coordenador/CoordRelatorios"));
const CoordAuditoria = lazy(() => import("./pages/coordenador/CoordAuditoria"));
const CoordHistorico = lazy(() => import("./pages/coordenador/CoordHistorico"));
const GestorUsuarios = lazy(() => import("./pages/gestor/GestorUsuarios"));
const GestorAuditoria = lazy(() => import("./pages/gestor/GestorAuditoria"));
const MagProcessos = lazy(() => import("./pages/magistrado/MagProcessos"));
const MagProspecçãos = lazy(() => import("./pages/magistrado/MagProspecçãos"));
const MagEmpresas = lazy(() => import("./pages/magistrado/MagEmpresas"));
const MagDecisoes = lazy(() => import("./pages/magistrado/MagDecisoes"));
const MagHistorico = lazy(() => import("./pages/magistrado/MagHistorico"));
const RecDocumentos = lazy(() => import("./pages/recuperanda/RecDocumentos"));
const RecPendencias = lazy(() => import("./pages/recuperanda/RecPendencias"));
const RecRelatorios = lazy(() => import("./pages/recuperanda/RecRelatorios"));
const RecCronograma = lazy(() => import("./pages/recuperanda/RecCronograma"));
const AdmRecuperandas = lazy(() => import("./pages/admjudicial/AdmRecuperandas"));
const AdmProspecçãos = lazy(() => import("./pages/admjudicial/AdmProspecçãos"));
const AdmPendencias = lazy(() => import("./pages/admjudicial/AdmPendencias"));
const AdmRelatorios = lazy(() => import("./pages/admjudicial/AdmRelatorios"));
const AdmHistorico = lazy(() => import("./pages/admjudicial/AdmHistorico"));
const MagistradoDashboard = lazy(() => import("./pages/MagistradoDashboard"));
const RecuperandaDashboard = lazy(() => import("./pages/RecuperandaDashboard"));
const AdmjudicialDashboard = lazy(() => import("./pages/AdmjudicialDashboard"));
const ProspecçãoWorkspace = lazy(() => import("./pages/ProspecçãoWorkspace"));
const ProcessoProspeccao = lazy(() => import("./pages/ProcessoProspeccao"));
const TrainAI = lazy(() => import("./pages/TrainAI"));
const ModeloMatematico = lazy(() => import("./pages/ModeloMatematico"));
const GestorIA = lazy(() => import("./pages/GestorIA"));
const GestaoAgentesOCR = lazy(() => import("./pages/GestaoAgentesOCR"));
const GestaoAgentes = lazy(() => import("./pages/GestaoAgentes"));
const GestorIAAprendizado = lazy(() => import("./pages/GestorIAAprendizado"));
const GestorIABuscaSemantica = lazy(() => import("./pages/GestorIABuscaSemantica"));
const GestorIAFailedJobs = lazy(() => import("./pages/GestorIAFailedJobs"));
const GestorIAPerfilAgentes = lazy(() => import("./pages/GestorIAPerfilAgentes"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const AdminAdmjudicialLinks = lazy(() => import("./pages/AdminAdmjudicialLinks"));
const CadastroProspecção = lazy(() => import("./pages/CadastroProspecção"));
const LiberarProspecção = lazy(() => import("./pages/LiberarProspecção"));
const RelatoriosContabeis = lazy(() => import("./pages/RelatoriosContabeis"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const ControleStatus = lazy(() => import("./pages/ControleStatus"));

// Tuned for multi-tenant: long stale window, no auto refetch on focus,
// reduces duplicate requests across role/permission/dashboard hooks.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 min: dados de role/perfil/listas raramente mudam
      gcTime: 30 * 60 * 1000,          // mantém em cache por 30 min
      refetchOnWindowFocus: false,     // evita re-fetch ao trocar de aba
      refetchOnReconnect: false,
      retry: 1,                        // não martelar a Cloud em falhas transitórias
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen bg-background p-6 md:p-8 animate-in fade-in duration-150">
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-3">
        <div className="h-7 w-64 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-96 max-w-full rounded-md bg-muted/70 animate-pulse" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-muted/50 animate-pulse" />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-border bg-muted/40 animate-pulse" />
    </div>
  </div>
);


const RmaHomeRoute = () => {
  const { roles, loading } = useUserRoles();
  if (loading) return null;
  if (roles.includes("magistrado")) return <MagistradoDashboard />;
  if (roles.includes("recuperanda")) return <RecuperandaDashboard />;
  return <EmpresaDashboard />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Site público (eager) */}
              <Route path="/" element={<Index />} />

              {/* Platafoprospecção Prospecção AJ (lazy) */}
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/select-role" element={<RoleSelection />} />
              <Route path="/dashboard" element={<ProtectedRoute allow={["coordenador"]}><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/analitico" element={<ProtectedRoute allow={["coordenador"]}><CoordDashboardAnalitico /></ProtectedRoute>} />
              <Route path="/dashboard/equipe" element={<ProtectedRoute allow={["coordenador"]}><CoordEquipe /></ProtectedRoute>} />
              <Route path="/dashboard/aprovacoes" element={<ProtectedRoute allow={["coordenador"]}><CoordAprovacoes /></ProtectedRoute>} />
              <Route path="/dashboard/empresas" element={<ProtectedRoute allow={["coordenador"]}><CoordEmpresas /></ProtectedRoute>} />
              <Route path="/dashboard/relatorios" element={<ProtectedRoute allow={["coordenador"]}><CoordRelatorios /></ProtectedRoute>} />
              <Route path="/dashboard/auditoria" element={<ProtectedRoute allow={["coordenador"]}><CoordAuditoria /></ProtectedRoute>} />
              <Route path="/dashboard/historico" element={<ProtectedRoute allow={["coordenador"]}><CoordHistorico /></ProtectedRoute>} />
              <Route path="/consultor" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorHome /></ProtectedRoute>} />
              <Route path="/consultor/dashboard" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorDashboard /></ProtectedRoute>} />
              <Route path="/consultor/prospecçãos" element={<Navigate to="/consultor/prospeccoes-aj" replace />} />
              <Route path="/consultor/prospeccoes-aj" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorProspecçãos /></ProtectedRoute>} />
              <Route path="/consultor/processos" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorProcessos /></ProtectedRoute>} />
              <Route path="/consultor/pendencias" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorPendencias /></ProtectedRoute>} />
              <Route path="/consultor/auditoria" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorPendencias /></ProtectedRoute>} />
              <Route path="/consultor/relatorios" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorRelatorios /></ProtectedRoute>} />
              <Route path="/consultor/base-de-dados" element={<ProtectedRoute allow={["consultor", "coordenador"]}><BaseDeDados /></ProtectedRoute>} />
              <Route path="/consultor/planilha-padrao-prospeccao" element={<ProtectedRoute allow={["consultor", "coordenador"]}><PlanilhaPadraoProspeccao /></ProtectedRoute>} />
              <Route path="/consultor/clientes" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorClientes /></ProtectedRoute>} />
              <Route path="/consultor/cadastro" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorCadastro /></ProtectedRoute>} />
              <Route path="/consultor/cadastro/admjudicial" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorCadastroAJ /></ProtectedRoute>} />
              <Route path="/consultor/cadastro/recuperandas" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorCadastroRec /></ProtectedRoute>} />
              <Route path="/consultor/cadastro/magistrados" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorCadastroMag /></ProtectedRoute>} />
              <Route path="/consultor/cadastro/tecnicos" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorCadastroTecnicos /></ProtectedRoute>} />
              <Route path="/tecnico/cadastro" element={<Navigate to="/consultor/cadastro" replace />} />
              <Route path="/tecnico/cadastro/:tipo" element={<Navigate to="/consultor/cadastro" replace />} />
              <Route path="/dashboard/cadastro" element={<ProtectedRoute allow={["coordenador"]}><CoordCadastroPerfis /></ProtectedRoute>} />
              <Route path="/dashboard/cadastro/:tipo" element={<ProtectedRoute allow={["coordenador"]}><CoordCadastroPerfilPage /></ProtectedRoute>} />

              <Route path="/consultor/configuracoes" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorConfiguracoes /></ProtectedRoute>} />
              <Route path="/consultor/historico" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorHistorico /></ProtectedRoute>} />
              <Route path="/consultor/logs" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ConsultorLogsIA /></ProtectedRoute>} />
              <Route path="/consultor/homologacao-ia" element={<ProtectedRoute allow={["consultor", "coordenador", "gestor_ia"]}><HomologacaoIA /></ProtectedRoute>} />
              <Route path="/consultor/certificacao-live" element={<ProtectedRoute allow={["consultor", "coordenador", "gestor_ia"]}><CertificacaoLive /></ProtectedRoute>} />
              <Route path="/magistrado" element={<ProtectedRoute allow={["magistrado"]}><MagistradoDashboard /></ProtectedRoute>} />
              <Route path="/recuperanda" element={<ProtectedRoute allow={["recuperanda"]}><RecuperandaDashboard /></ProtectedRoute>} />
              <Route path="/admjudicial" element={<ProtectedRoute allow={["admjudicial", "coordenador"]}><AdmjudicialDashboard /></ProtectedRoute>} />
              <Route path="/prospecção" element={<Navigate to="/prospeccao-aj" replace />} />
              <Route path="/prospeccao-aj" element={<ProtectedRoute><RmaHomeRoute /></ProtectedRoute>} />
              <Route path="/processo-prospeccao" element={<ProtectedRoute allow={["consultor", "coordenador"]}><ProcessoProspeccao /></ProtectedRoute>} />
              <Route path="/prospecção/:id" element={<Navigate to="/prospeccao-aj-workspace/:id" replace />} />
              <Route path="/prospeccao-aj-workspace/:id" element={<ProtectedRoute><ProspecçãoWorkspace /></ProtectedRoute>} />
              <Route path="/treinar-ia" element={<ProtectedRoute allow={["consultor", "coordenador", "gestor_ia", "recuperanda"]}><TrainAI /></ProtectedRoute>} />
              <Route path="/gestor-ia" element={<ProtectedRoute allow={["gestor_ia"]}><GestorIA /></ProtectedRoute>} />
              <Route path="/gestao-agentes-ocr" element={<ProtectedRoute allow={["gestor_ia"]}><GestaoAgentesOCR /></ProtectedRoute>} />
              <Route path="/gestao-agentes" element={<ProtectedRoute allow={["gestor_ia"]}><GestaoAgentes /></ProtectedRoute>} />
              <Route path="/gestor-ia/aprendizado" element={<ProtectedRoute allow={["gestor_ia"]}><GestorIAAprendizado /></ProtectedRoute>} />
              <Route path="/gestor-ia/busca-semantica" element={<ProtectedRoute allow={["gestor_ia"]}><GestorIABuscaSemantica /></ProtectedRoute>} />
              <Route path="/gestor-ia/failed-jobs" element={<ProtectedRoute allow={["gestor_ia"]}><GestorIAFailedJobs /></ProtectedRoute>} />
              <Route path="/gestor-ia/perfil-agentes" element={<ProtectedRoute allow={["gestor_ia"]}><GestorIAPerfilAgentes /></ProtectedRoute>} />
              <Route path="/gestor-ia/usuarios" element={<ProtectedRoute allow={["gestor_ia"]}><GestorUsuarios /></ProtectedRoute>} />
              <Route path="/gestor-ia/auditoria" element={<ProtectedRoute allow={["gestor_ia"]}><GestorAuditoria /></ProtectedRoute>} />
              <Route path="/user-management" element={<ProtectedRoute allow={["coordenador"]}><UserManagement /></ProtectedRoute>} />
              <Route path="/admin/admjudicial-links" element={<ProtectedRoute allow={["coordenador"]}><AdminAdmjudicialLinks /></ProtectedRoute>} />
              <Route path="/modelo-matematico" element={<ProtectedRoute allow={["coordenador", "consultor"]}><ModeloMatematico /></ProtectedRoute>} />
              <Route path="/cadastro-prospecção" element={<Navigate to="/cadastro-prospeccao-aj" replace />} />
              <Route path="/cadastro-prospeccao-aj" element={<ProtectedRoute allow={["coordenador"]}><CadastroProspecção /></ProtectedRoute>} />
              <Route path="/liberar-prospecção" element={<Navigate to="/liberar-prospeccao-aj" replace />} />
              <Route path="/liberar-prospeccao-aj" element={<ProtectedRoute allow={["coordenador"]}><LiberarProspecção /></ProtectedRoute>} />
              <Route path="/relatorios-contabeis" element={<ProtectedRoute allow={["consultor", "coordenador", "gestor_ia"]}><RelatoriosContabeis /></ProtectedRoute>} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/controle-status" element={<ControleStatus />} />

              <Route path="*" element={<Layout><NotFound /></Layout>} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
