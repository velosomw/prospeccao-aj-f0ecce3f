export type GraphErrorCategory =
  | "graph_permissions"
  | "onedrive_not_provisioned"
  | "share_link_access"
  | "app_token_endpoint_mismatch"
  | "unknown";

export interface GraphErrorPayload {
  success: false;
  error: string;
  hint?: string;
  category: GraphErrorCategory;
  graphStatus?: number;
  graphCode?: string;
  endpoint?: string;
  tokenType: "app";
  actions?: string[];
}

function parseJsonFragment(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function toGraphErrorPayload(error: unknown, fallbackEndpoint?: string): GraphErrorPayload {
  const rawMessage = asMessage(error);
  const match = rawMessage.match(/^Graph error \[(\d+)\] ([^:]+): (.*)$/s);

  if (!match) {
    return {
      success: false,
      error: rawMessage,
      category: "unknown",
      endpoint: fallbackEndpoint,
      tokenType: "app",
    };
  }

  const [, statusText, endpoint, bodyText] = match;
  const graphStatus = Number(statusText);
  const parsed = parseJsonFragment(bodyText);
  const graphCode = parsed?.code ?? parsed?.error?.code;
  const graphMessage = parsed?.message ?? parsed?.error?.message ?? rawMessage;

  if (graphStatus === 403 && (graphCode === "Authorization_RequestDenied" || /Insufficient privileges/i.test(graphMessage))) {
    return {
      success: false,
      error: graphMessage,
      hint: "Conceda admin consent às permissões User.Read.All, Files.ReadWrite.All e Sites.ReadWrite.All no app do Azure antes de testar novamente.",
      category: "graph_permissions",
      graphStatus,
      graphCode,
      endpoint,
      tokenType: "app",
      actions: [
        "Azure Portal → App registrations → API permissions",
        "Adicionar User.Read.All, Files.ReadWrite.All e Sites.ReadWrite.All como Application permissions",
        "Clicar em 'Grant admin consent' para o tenant",
      ],
    };
  }

  if (graphStatus === 404 && /mysite not found/i.test(graphMessage)) {
    return {
      success: false,
      error: graphMessage,
      hint: "O OneDrive do UPN configurado ainda não foi provisionado ou licenciado. A conta precisa abrir o OneDrive ao menos uma vez.",
      category: "onedrive_not_provisioned",
      graphStatus,
      graphCode,
      endpoint,
      tokenType: "app",
      actions: [
        "Confirmar licença de OneDrive/SharePoint para o usuário configurado",
        "Entrar como esse usuário e abrir o OneDrive até a biblioteca pessoal ser criada",
        "Executar o diagnóstico novamente após a provisão",
      ],
    };
  }

  if (graphStatus === 401 && endpoint.startsWith("shares/")) {
    return {
      success: false,
      error: graphMessage,
      hint: "O app token não conseguiu resolver o shareUrl. Normalmente falta Sites.ReadWrite.All com admin consent ou o link pertence a outro tenant.",
      category: "share_link_access",
      graphStatus,
      graphCode,
      endpoint,
      tokenType: "app",
      actions: [
        "Validar se o shareUrl pertence ao mesmo tenant Microsoft 365",
        "Garantir a permissão Sites.ReadWrite.All com admin consent",
        "Preferir o caminho /users/{upn}/drive/root:/... quando possível",
      ],
    };
  }

  if (graphStatus === 400 && endpoint === "me") {
    return {
      success: false,
      error: graphMessage,
      hint: "O endpoint /me não funciona com token de aplicação. Use /users/{upn}.",
      category: "app_token_endpoint_mismatch",
      graphStatus,
      graphCode,
      endpoint,
      tokenType: "app",
    };
  }

  return {
    success: false,
    error: graphMessage,
    category: "unknown",
    graphStatus,
    graphCode,
    endpoint: endpoint || fallbackEndpoint,
    tokenType: "app",
  };
}

export function graphErrorHttpStatus(payload: GraphErrorPayload) {
  return payload.category === "unknown" ? 500 : 200;
}