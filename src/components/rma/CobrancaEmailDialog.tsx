import { useEffect, useState } from "react";
import { Mail, Paperclip, Send, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prospecçãoId: string;
  companyName?: string;
  defaultEmail?: string;
  onSent?: () => void;
}

const buildDefaultBody = (companyName?: string) => `Prezados${companyName ? ` ${companyName}` : ""},

Em continuidade ao processo de Registro e Cobrança do Prospeccao, solicitamos o envio dos documentos pendentes para que possamos concluir a análise do período corrente.

Caso já tenham sido encaminhados, favor desconsiderar este e-mail.

Peprospecçãonecemos à disposição para esclarecimentos.

Atenciosamente,
Equipe BEx Prospeccao IA`;

export function CobrancaEmailDialog({ open, onOpenChange, prospecçãoId, companyName, defaultEmail, onSent }: Props) {
  const [recipient, setRecipient] = useState(defaultEmail || "");
  const [subject, setSubject] = useState(`Solicitação de documentos — ${prospecçãoId}${companyName ? ` ${companyName}` : ""}`);
  const [body, setBody] = useState(buildDefaultBody(companyName));
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setRecipient(defaultEmail || "");
      setSubject(`Solicitação de documentos — ${prospecçãoId}${companyName ? ` ${companyName}` : ""}`);
      setBody(buildDefaultBody(companyName));
      setFile(null);
    }
  }, [open, defaultEmail, prospecçãoId, companyName]);

  const handleSend = async () => {
    if (!recipient.trim() || !subject.trim() || !body.trim()) {
      toast.error("Preencha destinatário, assunto e mensagem");
      return;
    }
    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      let fileUrl: string | null = null;
      let filePath: string | null = null;
      let fileName: string | null = null;

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        filePath = `${prospecçãoId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("cobranca-attachments")
          .upload(filePath, file, { upsert: false });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage
          .from("cobranca-attachments")
          .createSignedUrl(filePath, 60 * 60 * 24 * 30); // 30 days
        fileUrl = signed?.signedUrl || null;
        fileName = file.name;
      }

      const idempotencyKey = `cobranca-${prospecçãoId}-${Date.now()}`;
      const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "cobranca-prospecção",
          recipientEmail: recipient.trim(),
          idempotencyKey,
          templateData: {
            subject,
            message: body,
            fileName,
            fileUrl,
            prospecçãoId,
            companyName,
          },
        },
      });
      if (sendErr) throw sendErr;

      const { error: dbErr } = await supabase.from("prospecção_cobrancas").insert({
        prospecção_id: prospecçãoId,
        company_name: companyName ?? null,
        recipient_email: recipient.trim(),
        subject,
        body,
        file_name: fileName,
        file_url: fileUrl,
        file_path: filePath,
        has_attachment: !!file,
        sent_by: userId,
      });
      if (dbErr) throw dbErr;

      toast.success("E-mail enviado e cobrança registrada");
      onSent?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Falha ao enviar e-mail");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" /> Enviar e-mail de cobrança
          </DialogTitle>
          <DialogDescription>
            O envio é registrado como cobrança do {prospecçãoId}{companyName ? ` — ${companyName}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="rec">Destinatário</Label>
            <Input id="rec" type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="email@empresa.com.br" />
          </div>
          <div>
            <Label htmlFor="subj">Assunto</Label>
            <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="body">Mensagem</Label>
            <Textarea id="body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="font-sans text-sm" />
          </div>
          <div>
            <Label htmlFor="file" className="flex items-center gap-2">
              <Paperclip className="w-4 h-4" /> Anexo (opcional)
            </Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="cursor-pointer"
              />
              {file && (
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            {file && (
              <p className="text-xs text-muted-foreground mt-1">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Enviando…" : "Enviar e registrar cobrança"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
