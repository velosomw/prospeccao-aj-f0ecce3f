// Upload binário para a Gemini Files API (protocolo resumable).
// Evita base64 inline, que estoura o limite de memória do worker em PDFs grandes (>15MB).

const BASE = "https://generativelanguage.googleapis.com";

export async function uploadGeminiFile(
  bytes: Uint8Array,
  mime: string,
  displayName: string,
  apiKey = Deno.env.get("GOOGLE_AI_API_KEY"),
): Promise<string> {
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY_AUSENTE");

  const start = await fetch(`${BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName || "documento.pdf" } }),
  });
  if (!start.ok) throw new Error(`GEMINI_UPLOAD_START_${start.status}: ${await start.text()}`);

  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("GEMINI_UPLOAD_SEM_URL");

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!up.ok) throw new Error(`GEMINI_UPLOAD_${up.status}: ${await up.text()}`);

  const info = await up.json();
  let file = info.file ?? info;
  for (let i = 0; i < 30 && file.state && file.state !== "ACTIVE"; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(`${BASE}/v1beta/${file.name}?key=${apiKey}`);
    file = await r.json();
    if (file.state === "FAILED") throw new Error("GEMINI_UPLOAD_FALHOU");
  }
  return file.uri as string;
}
