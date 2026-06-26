// Editor inline para corrigir uma extração da IA.
// Aceita { linhas: [{conta,descricao,valor,...}] } ou JSON arbitrário (mostra textarea).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";

interface Linha {
  conta?: string;
  descricao?: string;
  valor?: number | string;
  [k: string]: unknown;
}

interface Props {
  initial: any;
  onChange: (next: any) => void;
}

export default function ExtractionEditor({ initial, onChange }: Props) {
  const hasLinhas = initial && Array.isArray(initial.linhas);
  const [mode, setMode] = useState<"table" | "json">(hasLinhas ? "table" : "json");
  const [rows, setRows] = useState<Linha[]>(hasLinhas ? initial.linhas : []);
  const [jsonText, setJsonText] = useState<string>(JSON.stringify(initial ?? {}, null, 2));
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  const updateRows = (next: Linha[]) => {
    setRows(next);
    onChange({ ...(initial || {}), linhas: next });
  };

  const updateJson = (txt: string) => {
    setJsonText(txt);
    try {
      const parsed = JSON.parse(txt);
      setJsonErr(null);
      onChange(parsed);
    } catch (e) {
      setJsonErr(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant={mode === "table" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("table")}
        >Tabela</Button>
        <Button
          variant={mode === "json" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("json")}
        >JSON bruto</Button>
      </div>

      {mode === "table" ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-2 py-2 w-32">Conta</th>
                <th className="text-left px-2 py-2">Descrição</th>
                <th className="text-right px-2 py-2 w-40">Valor</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">
                    <Input
                      value={String(row.conta ?? "")}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = { ...next[i], conta: e.target.value };
                        updateRows(next);
                      }}
                      className="h-8"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      value={String(row.descricao ?? "")}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = { ...next[i], descricao: e.target.value };
                        updateRows(next);
                      }}
                      className="h-8"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      value={String(row.valor ?? "")}
                      onChange={(e) => {
                        const next = [...rows];
                        const v = e.target.value;
                        const num = Number(v.replace(/\./g, "").replace(",", "."));
                        next[i] = { ...next[i], valor: isNaN(num) ? v : num };
                        updateRows(next);
                      }}
                      className="h-8 text-right font-mono"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateRows(rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="text-center text-muted-foreground py-6 text-xs">
                  Nenhuma linha. Use "JSON bruto" ou adicione abaixo.
                </td></tr>
              )}
            </tbody>
          </table>
          <div className="p-2 border-t bg-muted/30">
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateRows([...rows, { conta: "", descricao: "", valor: 0 }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar linha
            </Button>
            <span className="text-xs text-muted-foreground ml-3">{rows.length} linha(s)</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs">JSON corrigido (gabarito)</Label>
          <Textarea
            value={jsonText}
            onChange={(e) => updateJson(e.target.value)}
            rows={18}
            className="font-mono text-xs"
          />
          {jsonErr && <p className="text-xs text-destructive">JSON inválido: {jsonErr}</p>}
        </div>
      )}
    </div>
  );
}
