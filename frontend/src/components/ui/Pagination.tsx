import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalPairs: number;
  onPageChange: (page: number | ((p: number) => number)) => void;
}

export function Pagination({ page, totalPages, totalPairs, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
      <p className="text-xs text-white/40 font-mono-dm">
        {totalPairs} pairs
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5 disabled:opacity-30 cursor-pointer disabled:cursor-default hover:bg-white/[0.06] transition-colors"
        >
          <ChevronLeft size={14} className="text-white/70" />
        </button>
        <span className="text-xs text-white/70 font-mono-dm min-w-[4rem] text-center">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-1.5 disabled:opacity-30 cursor-pointer disabled:cursor-default hover:bg-white/[0.06] transition-colors"
        >
          <ChevronRight size={14} className="text-white/70" />
        </button>
      </div>
    </div>
  );
}
