import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPageSize?: (size: number) => void;
}

export default function PaginationControls({
  page,
  totalPages,
  total,
  pageSize,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onPageSize,
}: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm">
      <span className="text-muted-foreground text-xs">
        {total > 0 ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}` : "Nenhum resultado"}
      </span>

      <div className="flex items-center gap-3">
        {onPageSize && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Exibir</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="text-xs bg-white border rounded-md px-2 py-1 outline-none focus:border-primary"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            disabled={!canPrev}
            className="p-1.5 rounded-md border bg-white hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-semibold tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={onNext}
            disabled={!canNext}
            className="p-1.5 rounded-md border bg-white hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
