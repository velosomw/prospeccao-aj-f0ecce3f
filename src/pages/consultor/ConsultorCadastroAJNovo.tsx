import CadastroPageShell from "@/components/consultor/CadastroPageShell";
import CadastroEntityForm from "@/components/consultor/CadastroEntityForm";

export default function ConsultorCadastroAJNovo() {
  return (
    <CadastroPageShell
      breadcrumb={[
        { label: "Cadastros", to: "/consultor/cadastro" },
        { label: "Administrador Judicial", to: "/consultor/cadastro/admjudicial" },
        { label: "Novo" },
      ]}
      title="Cadastro de Administrador Judicial"
      subtitle="Preencha os dados abaixo para cadastrar um novo administrador judicial."
    >
      <CadastroEntityForm backTo="/consultor/cadastro/admjudicial" />
    </CadastroPageShell>
  );
}
