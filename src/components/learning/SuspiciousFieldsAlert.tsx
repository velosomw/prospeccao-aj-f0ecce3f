import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Issue = { line?: number; field: string; reason: string };

function parseWarnings(arr: unknown, line?: number): Issue[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((w) => (typeof w === "string" ? w : ""))
    .filter(Boolean)
    .map((w) => {
      const idx = w.indexOf(":");
      if (idx > 0) return { line, field: w.slice(0, idx).trim(), reason: w.slice(idx + 1).trim() };
      return { line, field: "geral", reason: w };
    });
}

export function collectSuspiciousFields(json: unknown): Issue[] {
  const data = (json ?? {}) as Record<string, unknown>;
  const issues: Issue[] = [];
  // Esquemas com lista (NFE_COMPRAS.notas[])
  const notas = (data?.notas ?? data?.itens) as any[] | undefined;
  if (Array.isArray(notas)) {
    notas.forEach((n, i) => {
      issues.push(...parseWarnings(n?.warnings, n?.linha_origem ?? i + 1));
    });
  }
  // Warnings raiz
  issues.push(...parseWarnings(data?.warnings));
  return issues;
}

export default function SuspiciousFieldsAlert({ json }: { json: unknown }) {
  const issues = collectSuspiciousFields(json);
  if (issues.length === 0) return null;

  // Agrupa por campo para resumo
  const byField = new Map<string, Issue[]>();
  for (const i of issues) {
    const arr = byField.get(i.field) ?? [];
    arr.push(i);
    byField.set(i.field, arr);
  }

  return (
    <div className="rounded-md border border-[hsl(38,92%,50%)]/40 bg-[hsl(38,92%,50%)]/10 p-2 text-xs space-y-1.5">
      <div className="flex items-center gap-1.5 font-semibold text-[hsl(38,92%,30%)]">
        <AlertTriangle className="w-3.5 h-3.5" />
        {issues.length} campo(s) suspeito(s) detectado(s)
      </div>
      <div className="flex flex-wrap gap-1">
        {[...byField.entries()].map(([field, list]) => (
          <Badge
            key={field}
            variant="outline"
            className="border-[hsl(38,92%,50%)]/50 text-[hsl(38,92%,25%)] bg-white"
            title={list
              .map((i) => `${i.line ? `linha ${i.line}: ` : ""}${i.reason}`)
              .join("\n")}
          >
            {field} ({list.length})
          </Badge>
        ))}
      </div>
    </div>
  );
}
