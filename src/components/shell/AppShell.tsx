import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "./AppSidebar";
import AppTopbar from "./AppTopbar";
import { useUser } from "@/contexts/UserContext";

const roleHome: Record<string, string> = {
  coordenador: "/dashboard",
  consultor: "/consultor",
  magistrado: "/magistrado",
  recuperanda: "/recuperanda",
  admjudicial: "/admjudicial",
  gestor_ia: "/gestor-ia",
};

export default function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const { role } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const home = role ? roleHome[role] || "/consultor" : "/consultor";
  const showBack = location.pathname !== home;

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen flex w-full bg-[hsl(220,20%,97%)]">
        <AppSidebar />
        <SidebarInset className="flex flex-col min-w-0">
          <AppTopbar
            showBack={showBack}
            onBack={() => navigate(home)}
            title={title}
          />
          <main className="flex-1 min-w-0">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
