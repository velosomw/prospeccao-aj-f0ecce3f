import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function generateGeminiEmbedding(text: string): Promise<number[]> {
  const key = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!key) throw new Error("GOOGLE_AI_API_KEY not configured");

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Gemini Embedding Error ${resp.status}: ${error}`);
  }

  const json = await resp.json();
  return json.embedding.values;
}
