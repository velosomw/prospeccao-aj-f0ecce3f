// Prefetch de chunks de rota.
// Vite faz dedupe: usar EXATAMENTE o mesmo specifier do lazy() em App.tsx
// garante que o chunk pré-carregado seja o mesmo que o Suspense vai consumir.

type Loader = () => Promise<unknown>;

const loaders: Record<string, Loader> = {
  "/dashboard":               () => import("@/pages/Dashboard"),
  "/dashboard/equipe":        () => import("@/pages/coordenador/CoordEquipe"),
  "/dashboard/aprovacoes":    () => import("@/pages/coordenador/CoordAprovacoes"),
  "/dashboard/empresas":      () => import("@/pages/coordenador/CoordEmpresas"),
  "/dashboard/relatorios":    () => import("@/pages/coordenador/CoordRelatorios"),
  "/dashboard/auditoria":     () => import("@/pages/coordenador/CoordAuditoria"),
  "/dashboard/historico":     () => import("@/pages/coordenador/CoordHistorico"),

  "/consultor":               () => import("@/pages/consultor/ConsultorHome"),
  "/consultor/dashboard":     () => import("@/pages/ConsultorDashboard"),
  "/consultor/prospecções":          () => import("@/pages/consultor/ConsultorProspecções"),
  "/consultor/prospecções-aj": () => import("@/pages/consultor/ConsultorProspecções"),
  "/consultor/processos":     () => import("@/pages/consultor/ConsultorProcessos"),
  "/consultor/pendencias":    () => import("@/pages/consultor/ConsultorPendencias"),
  "/consultor/relatorios":    () => import("@/pages/consultor/ConsultorRelatorios"),
  "/consultor/base-de-dados": () => import("@/pages/consultor/BaseDeDados"),
  "/consultor/planilha-padrao-prospeccao": () => import("@/pages/consultor/PlanilhaPadraoProspeccao"),
  "/consultor/clientes":      () => import("@/pages/consultor/ConsultorClientes"),
  "/consultor/cadastro":      () => import("@/pages/consultor/ConsultorCadastro"),
  "/consultor/cadastro/admjudicial":  () => import("@/pages/consultor/ConsultorCadastroAJ"),
  "/consultor/cadastro/recuperandas": () => import("@/pages/consultor/ConsultorCadastroRec"),
  "/consultor/cadastro/magistrados":  () => import("@/pages/consultor/ConsultorCadastroMag"),
  "/consultor/cadastro/tecnicos":     () => import("@/pages/consultor/ConsultorCadastroTecnicos"),
  "/consultor/configuracoes": () => import("@/pages/consultor/ConsultorConfiguracoes"),
  "/consultor/historico":     () => import("@/pages/consultor/ConsultorHistorico"),
  "/consultor/logs":          () => import("@/pages/consultor/ConsultorLogsIA"),

  "/dashboard/analitico":     () => import("@/pages/coordenador/CoordDashboardAnalitico"),
  "/dashboard/cadastro":      () => import("@/pages/coordenador/CoordCadastroPerfis"),
  "/processo-prospeccao":     () => import("@/pages/ProcessoProspeccao"),
  "/treinar-ia":              () => import("@/pages/TrainAI"),
  "/relatorios-contabeis":    () => import("@/pages/RelatoriosContabeis"),
  "/cadastro-prospeccao-aj":  () => import("@/pages/CadastroProspeccao"),
  "/liberar-prospeccao-aj":   () => import("@/pages/LiberarProspeccao"),
  "/modelo-matematico":       () => import("@/pages/ModeloMatematico"),
  "/user-management":         () => import("@/pages/UserManagement"),
  "/gestao-agentes":          () => import("@/pages/GestaoAgentes"),
  "/gestao-agentes-ocr":      () => import("@/pages/GestaoAgentesOCR"),


  "/magistrado":              () => import("@/pages/MagistradoDashboard"),
  "/magistrado/processos":    () => import("@/pages/magistrado/MagProcessos"),
  "/magistrado/prospecções":         () => import("@/pages/magistrado/MagProspecções"),
  "/magistrado/empresas":     () => import("@/pages/magistrado/MagEmpresas"),
  "/magistrado/decisoes":     () => import("@/pages/magistrado/MagDecisoes"),
  "/magistrado/historico":    () => import("@/pages/magistrado/MagHistorico"),

  "/recuperanda":             () => import("@/pages/RecuperandaDashboard"),
  "/recuperanda/documentos":  () => import("@/pages/recuperanda/RecDocumentos"),
  "/recuperanda/pendencias":  () => import("@/pages/recuperanda/RecPendencias"),
  "/recuperanda/relatorios":  () => import("@/pages/recuperanda/RecRelatorios"),
  "/recuperanda/cronograma":  () => import("@/pages/recuperanda/RecCronograma"),

  "/admjudicial":              () => import("@/pages/AdmjudicialDashboard"),
  "/admjudicial/recuperandas": () => import("@/pages/admjudicial/AdmRecuperandas"),
  "/admjudicial/prospecções":         () => import("@/pages/admjudicial/AdmProspecções"),
  "/admjudicial/pendencias":   () => import("@/pages/admjudicial/AdmPendencias"),
  "/admjudicial/relatorios":   () => import("@/pages/admjudicial/AdmRelatorios"),
  "/admjudicial/historico":    () => import("@/pages/admjudicial/AdmHistorico"),

  "/gestor-ia":                   () => import("@/pages/GestorIA"),
  "/gestor-ia/aprendizado":       () => import("@/pages/GestorIAAprendizado"),
  "/gestor-ia/perfil-agentes":    () => import("@/pages/GestorIAPerfilAgentes"),
  "/gestor-ia/failed-jobs":       () => import("@/pages/GestorIAFailedJobs"),
  "/gestor-ia/busca-semantica":   () => import("@/pages/GestorIABuscaSemantica"),
  "/gestor-ia/usuarios":          () => import("@/pages/gestor/GestorUsuarios"),
  "/gestor-ia/auditoria":         () => import("@/pages/gestor/GestorAuditoria"),
};

const started = new Set<string>();

export function prefetchRoute(path: string): void {
  if (started.has(path)) return;
  const loader = loaders[path];
  if (!loader) return;
  started.add(path);
  // Fire-and-forget; falhas (offline) não devem quebrar a UI.
  loader().catch(() => started.delete(path));
}

// Pré-carrega, em tempo ocioso e de foprospeccao escalonada, todas as rotas visíveis
// no menu lateral — assim o clique já encontra o chunk em cache.
export function prefetchRoutesIdle(paths: string[]): void {
  const pending = paths.filter((p) => !started.has(p) && loaders[p]);
  if (!pending.length) return;

  const schedule =
    typeof (window as any).requestIdleCallback === "function"
      ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 2500 })
      : (cb: () => void) => window.setTimeout(cb, 300);

  let i = 0;
  const next = () => {
    if (i >= pending.length) return;
    prefetchRoute(pending[i++]);
    schedule(next);
  };
  schedule(next);
}

