import { supabase } from "@/integrations/supabase/client";

/**
 * Invoca uma edge function garantindo que o Authorization header
 * contenha o JWT do usuário (e não o anon key).
 * Se não houver sessão, lança erro claro.
 */
export async function invokeAuthed<T = any>(
  functionName: string,
  body?: any,
): Promise<{ data: T | null; error: any }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return {
      data: null,
      error: new Error("Sessão expirada. Faça login novamente."),
    };
  }
  // Aceita tanto invokeAuthed(name, payload) quanto invokeAuthed(name, { body: payload }).
  // Se o caller passou { body: X } (padrão antigo do supabase.functions.invoke), desembrulha.
  const payload =
    body && typeof body === "object" && "body" in body && Object.keys(body).length === 1
      ? (body as any).body
      : body;
  return await supabase.functions.invoke<T>(functionName, {
    body: payload,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}
