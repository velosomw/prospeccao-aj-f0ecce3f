import { invokeAuthed } from "@/lib/invokeAuthed";
import { toast } from "sonner";

export interface AJData {
  nome: string;
  email: string;
  contato?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  razao_social?: string;
}

export async function importAJs(data: AJData[]) {
  const results = {
    success: 0,
    errors: 0,
    details: [] as string[]
  };

  for (const item of data) {
    try {
      // Usamos uma senha padrão forte ou aleatória para importação
      const password = Math.random().toString(36).slice(-10) + "A1!";
      
      const payload = {
        action: "create",
        full_name: item.contato || item.nome, // Prioriza o contato se disponível como nome de exibição
        email: item.email,
        password: password,
        role: "admjudicial",
        // Campos extras para profiles
        razao_social: item.nome,
        cnpj: "", // Planilha não tem CNPJ, mas o perfil pode ter
        endereco: `${item.endereco || ""}, ${item.numero || ""}`.trim(),
        cidade: item.cidade,
        uf: item.uf,
        telefone: item.telefone,
        site: "",
        contato_nome: item.contato,
        bairro: item.bairro,
        cep: item.cep,
        complemento: item.complemento
      };

      const { error } = await invokeAuthed("admin-create-user", payload);
      
      if (error) {
        results.errors++;
        results.details.push(`Erro ao importar ${item.email}: ${error.message || error}`);
      } else {
        results.success++;
      }
    } catch (err: any) {
      results.errors++;
      results.details.push(`Falha crítica em ${item.email}: ${err.message}`);
    }
  }

  return results;
}
