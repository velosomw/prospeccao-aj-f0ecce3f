import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Shield, Brain, Building2, Scale, User, LogOut,
  LayoutDashboard, FileText, Upload, Download,
  History, Activity, Settings, Users,
  Briefcase, AlertTriangle, FolderOpen, FileBarChart, FileSpreadsheet, CheckCircle2,
  Gavel, MessageCircle, Calendar, Megaphone, FilePlus, Sun, Moon, Home, Bell, ChevronDown, ChevronRight, Database,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUser } from "@/contexts/UserContext";
import { prefetchRoute, prefetchRoutesIdle } from "@/lib/routePrefetch";

const roleHome: Record<string, string> = {
  coordenador: "/dashboard",
  consultor: "/consultor",
  magistrado: "/magistrado",
  recuperanda: "/recuperanda",
  admjudicial: "/admjudicial",
  gestor_ia: "/gestor-ia",
};

const roleLabels: Record<string, string> = {
  coordenador: "Coordenador",
  consultor: "Consultor",
  magistrado: "Magistrado",
  recuperanda: "Empresa Prospecção",
  gestor_ia: "Gestor IA",
};

interface NavItem { label: string; to: string; icon: any; badge?: number; children?: { label: string; to: string }[]; }
interface NavGroup { label: string; items: NavItem[]; }

const buildNav = (role: string | null): NavGroup[] => {
  const home = role ? roleHome[role] : "/";
  const groups: NavGroup[] = [];
  if (role !== "consultor") {
    groups.push({ label: "Principal", items: [{ label: "Visão Geral", to: home, icon: LayoutDashboard }] });
  }

  if (role === "coordenador") {
    groups.push({
      label: "Coordenação",
      items: [
        { label: "Dashboard",   to: "/dashboard/analitico",   icon: LayoutDashboard },
        { label: "Processamento IA", to: "/processo-prospeccao", icon: Briefcase },
        { label: "Upload Planilha", to: "/treinar-ia",           icon: Brain },
        
        { label: "Planilha de Carga",  to: "/dashboard/relatorios",  icon: FileBarChart },
        { label: "Base de Dados",      to: "/consultor/base-de-dados", icon: Database },
        { label: "Empresa Prospecção", to: "/dashboard/empresas",    icon: Building2 },
        
        { label: "Cadastros",   to: "/cadastro-prospeccao-aj", icon: FilePlus },
        { label: "Relatórios & Cartas", to: "/relatorios-contabeis", icon: FileBarChart },
        { label: "Aprovações",  to: "/dashboard/aprovacoes",  icon: CheckCircle2, badge: 9 },
        { label: "Equipe",      to: "/dashboard/equipe",      icon: Users },
        { label: "Histórico",   to: "/dashboard/historico",   icon: History },
        
      ],
    });
  }

  if (role === "consultor") {
    groups.push({
      label: "Gestão",
      items: [
        { label: "Home",          to: "/consultor",               icon: Home },
        { label: "Dashboard",     to: "/consultor/dashboard",     icon: LayoutDashboard },
        { label: "Processamento IA", to: "/processo-prospeccao",     icon: Briefcase },
        { label: "Upload Planilha",  to: "/treinar-ia",              icon: Brain },
        
        { label: "Planilha de Carga",    to: "/consultor/relatorios",    icon: FileBarChart },
        { label: "Base de Dados",        to: "/consultor/base-de-dados",  icon: Database },
        { label: "Planilha Padrão Prospecção", to: "/consultor/planilha-padrao-prospeccao", icon: FileSpreadsheet },
        { label: "Empresa Prospecção", to: "/consultor/clientes",      icon: Building2 },
        
        { label: "Cadastros",     to: "/consultor/cadastro",      icon: FilePlus, children: [
          { label: "Administrador Judicial", to: "/consultor/cadastro/admjudicial" },
          { label: "Empresa Prospecção",            to: "/consultor/cadastro/recuperandas" },
          { label: "Magistrado",              to: "/consultor/cadastro/magistrados" },
          { label: "Técnicos",                to: "/consultor/cadastro/tecnicos" },
        ] },
        { label: "Relatórios & Cartas", to: "/relatorios-contabeis", icon: FileBarChart },
        
      ],
    });
  }

  if (role === "gestor_ia") {
    groups.push({
      label: "Governança IA",
      items: [
        { label: "Aprendizado IA",     to: "/gestor-ia/aprendizado",     icon: Brain },
        { label: "Upload Planilha",         to: "/treinar-ia",                icon: Brain },
        { label: "Perfil de Agentes",  to: "/gestor-ia/perfil-agentes",  icon: Settings },
        { label: "Failed Jobs",        to: "/gestor-ia/failed-jobs",     icon: AlertTriangle, badge: 3 },
        { label: "Busca Semântica",    to: "/gestor-ia/busca-semantica", icon: FileText },
        { label: "Usuários",           to: "/gestor-ia/usuarios",        icon: Users },
        
      ],
    });
  }
  if (role === "magistrado") {
    groups.push({
      label: "Jurisdição",
      items: [
        { label: "Processos",       to: "/magistrado/processos", icon: Gavel },
        { label: "Prospecções AJ Recebidas",  to: "/magistrado/prospeccoes-aj",      icon: FileText, badge: 7 },
        { label: "Empresa Prospecção",    to: "/magistrado/empresas",  icon: Building2 },
        { label: "Decisões",        to: "/magistrado/decisoes",  icon: Scale },
        { label: "Histórico",       to: "/magistrado/historico", icon: History },
      ],
    });
  }

  if (role === "recuperanda") {
    groups.push({
      label: "Minha Prospecção",
      items: [
        { label: "Documentos",   to: "/recuperanda/documentos",  icon: FolderOpen },
        { label: "Pendências",   to: "/recuperanda/pendencias",  icon: AlertTriangle, badge: 14 },
        { label: "Planilha de Carga",   to: "/recuperanda/relatorios",  icon: FileBarChart },
        { label: "Cronograma",   to: "/recuperanda/cronograma",  icon: Calendar },
        { label: "Upload Planilha",   to: "/treinar-ia",              icon: Brain },
      ],
    });
  }

  if (role === "admjudicial") {
    groups.push({
      label: "Administração",
      items: [
        { label: "Empresa Prospecção", to: "/admjudicial/recuperandas", icon: Building2 },
        { label: "Prospecções AJ", to: "/admjudicial/prospeccoes-aj",         icon: Briefcase },
        { label: "Pendências",   to: "/admjudicial/pendencias",   icon: AlertTriangle, badge: 23 },
        { label: "Planilha de Carga",   to: "/admjudicial/relatorios",   icon: FileBarChart },
        { label: "Histórico",    to: "/admjudicial/historico",    icon: History },
      ],
    });
  }

  return groups;
};

// Estilos para sidebar — modo escuro (Deep Navy, padrão) e modo claro (cinza claro)
const THEMES = {
  dark:  { bg: "hsl(222,47%,14%)",  soft: "hsl(222,47%,18%)" },
  light: { bg: "hsl(220,14%,93%)",  soft: "hsl(220,13%,86%)" },
};

export default function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, userName, userEmail, logout } = useUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groups = buildNav(role);
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>({});

  // Pré-carrega em tempo ocioso todas as páginas do menu do perfil atual,
  // para que o clique renderize praticamente na hora.
  useEffect(() => {
    const paths = groups.flatMap((g) =>
      g.items.flatMap((it) => [it.to, ...(it.children?.map((c) => c.to) ?? [])]),
    );
    prefetchRoutesIdle(paths);
  }, [role]);

  const toggleSubmenu = (label: string) => {
    setOpenSubmenus(prev => ({ ...prev, [label]: !prev[label] }));
  };


  const [contrast, setContrast] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("prospecção:sidebar-contrast") as "dark" | "light") || "dark";
  });
  useEffect(() => { localStorage.setItem("prospecção:sidebar-contrast", contrast); }, [contrast]);
  const theme = THEMES[contrast];
  const NAVY = theme.bg;
  const NAVY_SOFT = theme.soft;
  const isLight = contrast === "light";

  // Tokens de cor sensíveis ao tema (classes completas para o Tailwind JIT)
  const txtBase    = isLight ? "text-gray-900"  : "text-white";
  const txtStrong  = isLight ? "text-gray-900"  : "text-white";
  const txtMuted   = isLight ? "text-gray-700"  : "text-white/80";
  const txtSubtle  = isLight ? "text-gray-600"  : "text-white/70";
  const txtFaint   = isLight ? "text-gray-500"  : "text-white/60";
  const txtFainter = isLight ? "text-gray-400"  : "text-white/40";
  const hoverTxt   = isLight ? "hover:text-gray-900" : "hover:text-white";
  const hoverBg    = isLight ? "hover:bg-black/5" : "hover:bg-white/5";
  const subBorder  = isLight ? "border-black/10" : "border-white/10";
  const togglePill = isLight ? "bg-black/5 hover:bg-black/10" : "bg-white/10 hover:bg-white/20";
  const sidebarFg  = isLight ? "222 47% 14%" : "0 0% 100%";

  const isActive = (to: string) => {
    if (to.includes("#")) return false;
    if (to === "/consultor") return pathname === "/consultor";
    return pathname === to || pathname.startsWith(to + "/");
  };

  const initials = (userName || userEmail || "U")
    .split(/\s+/).map(s => s[0]?.toUpperCase() || "").slice(0, 2).join("");

  return (
    <TooltipProvider delayDuration={150}>
    <Sidebar
      collapsible="icon"
      className="border-r-0"
      style={{ ["--sidebar-background" as any]: NAVY, ["--sidebar-foreground" as any]: sidebarFg }}
    >
      <SidebarHeader className={txtBase} style={{ background: NAVY }}>
        <div className={`flex items-center gap-2 px-2 py-3 ${collapsed ? "justify-center" : "justify-between"}`}>
          <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-9 h-9 rounded-lg bg-[hsl(217,91%,50%)] flex items-center justify-center flex-shrink-0">
              <Shield className="w-[23px] h-[23px] text-white" />
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <div className={`text-base font-bold tracking-wide ${txtStrong}`}>Platafoprospecção de Prospecção BEx</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setContrast(contrast === "dark" ? "light" : "dark")}
                  className={`w-8 h-8 rounded-lg ${togglePill} ${txtBase} flex items-center justify-center transition-colors`}
                  aria-label="Alternar contraste da sidebar"
                >
                  {contrast === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {contrast === "dark" ? "Modo executivo (claro)" : "Modo institucional (escuro)"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {collapsed && (
          <div className="px-2 pb-2 flex justify-center">
            <button
              onClick={() => setContrast(contrast === "dark" ? "light" : "dark")}
              className={`w-8 h-8 rounded-lg ${togglePill} ${txtBase} flex items-center justify-center transition-colors`}
              aria-label="Alternar contraste da sidebar"
            >
              {contrast === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        )}

      </SidebarHeader>

      <SidebarContent style={{ background: NAVY }}>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            {!collapsed && (
              <SidebarGroupLabel className={`${txtFainter} text-[10px] font-bold uppercase tracking-wider`}>
                {g.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => {
                  const Icon = it.icon;
                  const active = isActive(it.to);
                  return (
                    <SidebarMenuItem key={`${g.label}-${it.label}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center">
                            <SidebarMenuButton
                              asChild
                              className={`${txtMuted} ${hoverBg} ${hoverTxt} data-[active=true]:bg-[hsl(217,91%,50%)] data-[active=true]:text-white flex-1`}
                              isActive={active}
                            >
                              <Link
                                to={it.to}
                                className="flex items-center gap-2.5"
                                onMouseEnter={() => prefetchRoute(it.to)}
                                onFocus={() => prefetchRoute(it.to)}
                                onTouchStart={() => prefetchRoute(it.to)}
                              >
                                <Icon className="w-6 h-6 flex-shrink-0" />
                                {!collapsed && (
                                  <>
                                    <span className="text-sm">{it.label}</span>
                                    {it.badge !== undefined && (
                                      <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(0,84%,60%)] text-white">
                                        {it.badge}
                                      </span>
                                    )}
                                  </>
                                )}
                              </Link>
                            </SidebarMenuButton>
                            {!collapsed && it.children && (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleSubmenu(it.label);
                                }}
                                className={`p-1.5 rounded-md ${hoverBg} ${txtSubtle} transition-colors ml-0.5`}
                              >
                                {openSubmenus[it.label] || (active || it.children.some(c => pathname.startsWith(c.to))) ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </TooltipTrigger>
                        {collapsed && (
                          <TooltipContent
                            side="right"
                            sideOffset={12}
                            className="border-0 bg-[hsl(217,91%,50%)] text-white font-semibold rounded-full px-4 py-2 text-sm shadow-lg"
                          >
                            {it.label}
                            {it.badge !== undefined && (
                              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20">
                                {it.badge}
                              </span>
                            )}
                          </TooltipContent>
                        )}
                      </Tooltip>
                      {!collapsed && it.children && (openSubmenus[it.label] || active || it.children.some(c => pathname.startsWith(c.to))) && (
                        <SidebarMenuSub className={subBorder}>
                          {it.children.map((c) => {
                            const cActive = pathname === c.to || pathname.startsWith(c.to + "/");
                            return (
                              <SidebarMenuSubItem key={c.to}>
                                <SidebarMenuSubButton asChild isActive={cActive}
                                  className={`${txtSubtle} ${hoverBg} ${hoverTxt} data-[active=true]:bg-transparent data-[active=true]:text-[hsl(217,91%,50%)] data-[active=true]:font-semibold`}>
                                  <Link
                                    to={c.to}
                                    onMouseEnter={() => prefetchRoute(c.to)}
                                    onFocus={() => prefetchRoute(c.to)}
                                    onTouchStart={() => prefetchRoute(c.to)}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                                    <span className="text-xs">{c.label}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

      </SidebarContent>

      <SidebarFooter className="border-t-0 gap-2" style={{ background: NAVY }}>
        {!collapsed && role && (
          <div className="px-2 pt-2">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-2.5" style={{ background: NAVY_SOFT }}>
              <div className="w-9 h-9 rounded-full bg-[hsl(217,91%,50%)] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                {initials}
              </div>
              <div className="leading-tight overflow-hidden">
                <div className={`text-xs font-semibold ${txtStrong} truncate`}>{userName || "Usuário"}</div>
                <div className={`text-[10px] ${txtFaint} truncate`}>{roleLabels[role] || role}</div>
                <div className={`text-[10px] ${txtFainter} truncate`}>{userEmail}</div>
              </div>
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={async () => { await logout(); navigate("/", { replace: true }); }}
              className={`${txtSubtle} ${hoverBg} ${hoverTxt}`}
              title={collapsed ? "Sair" : undefined}
            >
              <LogOut className="w-6 h-6 flex-shrink-0" />
              {!collapsed && <span className="text-xs">Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    </TooltipProvider>
  );
}
