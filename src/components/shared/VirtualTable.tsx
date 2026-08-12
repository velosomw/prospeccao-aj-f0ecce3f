import { useRef, ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import PaginationControls from "./PaginationControls";
import { usePagination } from "@/hooks/usePagination";

interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  defaultPageSize?: number;
  estimateSize?: number;
  maxHeight?: number | string;
  emptyMessage?: string;
  showPagination?: boolean;
  headerClassName?: string;
  rowClassName?: string | ((row: T, index: number) => string);
  onRowClick?: (row: T) => void;

  /** Controlled pagination overrides (backend-driven) */
  total?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
}

export default function VirtualTable<T>({
  data,
  columns,
  rowKey,
  defaultPageSize = 20,
  estimateSize = 52,
  maxHeight = 480,
  emptyMessage = "Nenhum resultado encontrado.",
  showPagination = true,
  headerClassName = "bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider",
  rowClassName = "border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors",
  total,
  page: controlledPage,
  onPageChange,
  pageSize: controlledPageSize,
  onPageSizeChange,
  onRowClick,
}: VirtualTableProps<T>) {
  const isControlled =
    controlledPage !== undefined && onPageChange !== undefined;

  const {
    page: localPage,
    pageSize: localPageSize,
    total: localTotal,
    totalPages: localTotalPages,
    paginated: localPaginated,
    canPrev: localCanPrev,
    canNext: localCanNext,
    goPrev: localGoPrev,
    goNext: localGoNext,
    setPageSize: localSetPageSize,
  } = usePagination(data, defaultPageSize);

  const page = isControlled ? controlledPage : localPage;
  const pageSize = isControlled
    ? (controlledPageSize ?? defaultPageSize)
    : localPageSize;
  const totalRows = isControlled ? (total ?? data.length) : localTotal;
  const totalPages = isControlled
    ? Math.max(1, Math.ceil(totalRows / pageSize))
    : localTotalPages;
  const paginated = isControlled ? data : localPaginated;
  const canPrev = isControlled ? page > 1 : localCanPrev;
  const canNext = isControlled ? page < totalPages : localCanNext;

  const goPrev = () => {
    if (isControlled) onPageChange(Math.max(1, page - 1));
    else localGoPrev();
  };
  const goNext = () => {
    if (isControlled) onPageChange(Math.min(totalPages, page + 1));
    else localGoNext();
  };
  const setPageSize = (s: number) => {
    if (isControlled && onPageSizeChange) onPageSizeChange(s);
    else localSetPageSize(s);
  };

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: paginated.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex flex-col">
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ maxHeight }}
      >
        <table className="w-full text-sm">
          <thead className={headerClassName}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left px-4 py-2.5 ${col.className ?? ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center text-muted-foreground py-10"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {virtualItems.length > 0 && (
              <tr>
                <td colSpan={columns.length}>
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {virtualItems.map((virtualItem) => {
                      const row = paginated[virtualItem.index];
                      return (
                        <div
                          key={virtualItem.key}
                          data-index={virtualItem.index}
                          ref={virtualizer.measureElement}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <table className="w-full text-sm">
                            <tbody>
                              <tr
                                className={`${typeof rowClassName === "function" ? rowClassName(row, virtualItem.index) : rowClassName}${onRowClick ? " cursor-pointer" : ""}`}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                              >
                                {columns.map((col) => (
                                  <td
                                    key={col.key}
                                    className={`px-4 py-3 ${col.className ?? ""}`}
                                  >
                                    {typeof col.cell === 'function' ? col.cell(row) : (row as any)[col.key]}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPagination && totalRows > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={totalRows}
          pageSize={pageSize}
          canPrev={canPrev}
          canNext={canNext}
          onPrev={goPrev}
          onNext={goNext}
          onPageSize={setPageSize}
        />
      )}
    </div>
  );
}

