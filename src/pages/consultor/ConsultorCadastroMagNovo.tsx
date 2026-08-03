import CadastroPageShell from "@/components/consultor/CadastroPageShell";
import CadastroEntityForm from "@/components/consultor/CadastroEntityForm";

export default function ConsultorCadastroMagNovo() {
  return (
    <CadastroPageShell
      breadcrumb={[
        { label: "Cadastro de Perfils", to: "/consultor/cadastro" },
        { label: "Magistrados", to: "/consultor/cadastro/magistrados" },
        { label: "Novo" },
      ]}
      title="Cadastro de Magistrado"
      subtitle="Preencha os dados abaixo para cadastrar um novo magistrado."
    >
      <CadastroEntityForm backTo="/consultor/cadastro/magistrados" variant="magistrado" />
    </CadastroPageShell>
  );
}
