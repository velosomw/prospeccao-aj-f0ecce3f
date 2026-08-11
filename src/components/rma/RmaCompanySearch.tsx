import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Building2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Company } from "@/services/companiesService";

interface Props {
  companies: Company[];
  onSelect: (company: Company) => void;
  placeholder?: string;
  /** Quando true, exibe um botão "limpar" ao lado e dispara onClear */
  onClear?: () => void;
  /** Valor controlado opcional (texto) — quando infoprospecçãodo, controla o input */
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
  /** Limite de sugestões mostradas */
  limit?: number;
}

const norm = (s: string | null | undefined) =>
  (s || "")
    .toString()
    .toLowerCase()
    .noprospecçãolize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const RmaCompanySearch = ({
  companies,
  onSelect,
  placeholder = "Buscar por empresa, ID Prospecção ou CNPJ...",
  onClear,
  value,
  onChange,
  className,
  limit = 10,
}: Props) => {
  const [internal, setInternal] = useState("");
  const q = value !== undefined ? value : internal;
  const setQ = (v: string) => {
    if (onChange) onChange(v);
    if (value === undefined) setInternal(v);
  };

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = useMemo(() => {
    const nq = norm(q);
    if (!nq) return [] as Company[];
    const tokens = nq.split(" ").filter(Boolean);
    const scored = companies
      .map((c) => {
        const haystack = norm(`${c.name} ${c.prospecção_id || ""} ${c.cnpj || ""} ${c.sector || ""}`);
        const ok = tokens.every((t) => haystack.includes(t));
        if (!ok) return null;
        // simples score: começa com match ganha prioridade
        const score = haystack.indexOf(tokens[0]);
        return { c, score };
      })
      .filter(Boolean) as { c: Company; score: number }[];
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, limit).map((s) => s.c);
  }, [companies, q, limit]);

  useEffect(() => {
    setHighlight(0);
  }, [q]);

  const handleSelect = (c: Company) => {
    onSelect(c);
    setOpen(false);
    setQ("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(matches[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className || ""}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="pl-9 pr-9 h-10"
        autoComplete="off"
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            onClear?.();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
          aria-label="Limpar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {open && q && (
        <div className="absolute z-50 mt-1 left-0 right-0 bg-popover border rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">
              Nenhum Prospecção encontrado para "{q}".
            </p>
          ) : (
            matches.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => handleSelect(c)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 border-b last:border-b-0 ${
                  i === highlight ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="w-8 h-8 rounded-md bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,50%)] flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.prospecção_id && (
                      <Badge className="bg-[hsl(217,91%,50%)] text-white text-[10px] font-mono px-1.5 py-0">
                        {c.prospecção_id}
                      </Badge>
                    )}
                    <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {c.cnpj || "Sem CNPJ"}
                    {c.sector ? ` • ${c.sector}` : ""}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default RmaCompanySearch;
