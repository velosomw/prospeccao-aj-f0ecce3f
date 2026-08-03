import { invokeAuthed } from "@/lib/invokeAuthed";

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
  treatment_sigla?: string;
}

export async function importAJs(data: AJData[]) {
  const results = {
    success: 0,
    errors: 0,
    details: [] as string[]
  };

  for (const item of data) {
    try {
      const password = Math.random().toString(36).slice(-10) + "A1!";
      
      const payload = {
        action: "create",
        full_name: item.nome,
        email: item.email,
        password: password,
        role: "admjudicial",
        // Precise mapping to match profile columns
        treatment_sigla: item.treatment_sigla || "Dr.",
        contato_principal: item.contato,
        endereco: item.endereco,
        numero: item.numero,
        complemento: item.complemento,
        bairro: item.bairro,
        cidade: item.cidade,
        uf: item.uf,
        cep: item.cep,
        telefone: item.telefone
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
