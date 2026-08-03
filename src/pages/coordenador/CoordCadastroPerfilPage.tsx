import { Navigate, useParams } from "react-router-dom";
import RoleCadastroPage, { type CadastroRole } from "@/components/consultor/RoleCadastroPage";

const CONFIG: Record<string, {
  role: CadastroRole; title: string; subtitle: string; singular: string; breadcrumbLabel: string;
}> = {
  admjudicial: {
    role: "admjudicial",
    title: "Administradores Judiciais",
    subtitle: "Usuários com perfil de Administrador Judicial cadastrados na plataforma.",
    singular: "Administrador Judicial",
    breadcrumbLabel: "Administrador Judicial",
  },
  recuperandas: {
    role: "recuperanda",
    title: "Empresas Prospecção",
    subtitle: "Usuários com perfil de Empresa Externa cadastrados na plataforma.",
    singular: "Empresa Prospecção",
    breadcrumbLabel: "Empresas Prospecção",
  },
  magistrados: {
    role: "magistrado",
    title: "Magistrados",
    subtitle: "Usuários com perfil de Magistrado cadastrados na plataforma.",
    singular: "Magistrado",
    breadcrumbLabel: "Magistrados",
  },
  tecnicos: {
    role: "consultor",
    title: "Técnicos",
    subtitle: "Usuários com perfil de Técnico (Consultor) cadastrados na plataforma.",
    singular: "Técnico",
    breadcrumbLabel: "Técnicos",
  },
};

export default function CoordCadastroPerfilPage() {
  const { tipo } = useParams<{ tipo: string }>();
  const cfg = tipo ? CONFIG[tipo] : undefined;

  if (!cfg) return <Navigate to="/dashboard/cadastro" replace />;

  return <RoleCadastroPage {...cfg} backTo="/dashboard/cadastro" />;
}
