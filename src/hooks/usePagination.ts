import { useState, useMemo } from "react";

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function usePagination<T>(items: T[], defaultPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize]
  );

  const clampedPage = Math.min(page, totalPages);

  const paginated = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, clampedPage, pageSize]);

  const canPrev = clampedPage > 1;
  const canNext = clampedPage < totalPages;

  const goTo = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages);
    setPage(next);
  };

  const goPrev = () => canPrev && goTo(clampedPage - 1);
  const goNext = () => canNext && goTo(clampedPage + 1);

  const setPageSizeAndReset = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  return {
    page: clampedPage,
    pageSize,
    total: items.length,
    totalPages,
    paginated,
    canPrev,
    canNext,
    goTo,
    goPrev,
    goNext,
    setPageSize: setPageSizeAndReset,
  };
}
