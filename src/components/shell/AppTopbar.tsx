import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/contexts/UserContext";
import NotificationBell from "@/components/messaging/NotificationBell";

const roleLabels: Record<string, string> = {
  coordenador: "Coordenador",
  consultor: "Consultor",
  magistrado: "Magistrado",
  recuperanda: "Empresa Prospecção",
  gestor_ia: "Gestor IA",
};

interface Props {
  showBack?: boolean;
  onBack?: () => void;
  title?: string;
}

export default function AppTopbar({ showBack, onBack, title }: Props) {
  const { userName, userEmail, role, logout } = useUser();
  const navigate = useNavigate();

  const initials = (userName || userEmail || "U")
    .split(/\s+/).map(s => s[0]?.toUpperCase() || "").slice(0, 2).join("");

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-border h-14 flex items-center px-4 gap-3">
      <SidebarTrigger className="text-muted-foreground" />
      {title && <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>}

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 px-2 gap-2">
              <div className="w-8 h-8 rounded-full bg-[hsl(217,91%,50%)] text-white text-xs font-bold flex items-center justify-center">
                {initials}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-xs font-semibold">{userName || "Usuário"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {role ? (roleLabels[role] || role) : ""}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="leading-tight">
                <div className="text-sm font-semibold">{userName || "Usuário"}</div>
                <div className="text-xs text-muted-foreground font-normal">{userEmail}</div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => { await logout(); navigate("/", { replace: true }); }}
              className="text-destructive cursor-pointer"
            >
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
