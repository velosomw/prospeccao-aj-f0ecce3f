import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = "loading" | "valid" | "already" | "invalid" | "submitting" | "done" | "error";

export default function Unsubscribe() {
  const [state, setState] = useState<State>("loading");
  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
      headers: { apikey: SUPABASE_KEY },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState("valid");
        else if (d.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    if (error || !data?.success) setState("error");
    else setState("done");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        <h1 className="text-xl font-bold">Cancelar inscrição</h1>
        {state === "loading" && <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />}
        {state === "valid" && (
          <>
            <p className="text-sm text-muted-foreground">Confirme o cancelamento para deixar de receber estes e-mails.</p>
            <Button onClick={confirm} className="w-full">Confiprospecçãor cancelamento</Button>
          </>
        )}
        {state === "submitting" && <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />}
        {state === "done" && (
          <div className="space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <p className="text-sm">Inscrição cancelada com sucesso.</p>
          </div>
        )}
        {state === "already" && (
          <div className="space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <p className="text-sm">Você já havia cancelado a inscrição.</p>
          </div>
        )}
        {(state === "invalid" || state === "error") && (
          <div className="space-y-2">
            <XCircle className="w-10 h-10 mx-auto text-red-600" />
            <p className="text-sm">Link inválido ou expirado.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
