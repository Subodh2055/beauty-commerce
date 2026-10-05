export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`shimmer rounded-control bg-surface-2 ${className}`} aria-hidden />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-[4/5] w-full rounded-card" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/4" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ProductListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-4 py-5 sm:gap-6">
          <Skeleton className="aspect-[4/5] w-28 shrink-0 rounded-card sm:w-36" />
          <div className="flex-1 space-y-3 pt-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Whole shop listing while results stream: sidebar, toolbar, then grid or list. */
export function ListingSkeleton({ view = "grid" }: { view?: "grid" | "list" }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[248px_1fr]" aria-busy aria-label="Loading products">
      <div className="hidden space-y-7 lg:block">
        {[5, 4, 6].map((rows, g) => (
          <div key={g} className="space-y-2.5">
            <Skeleton className="h-3 w-20" />
            {Array.from({ length: rows }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ))}
      </div>
      <div>
        <Skeleton className="mb-4 h-9 w-28 lg:hidden" />
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-56 rounded-pill" />
        </div>
        {view === "list" ? <ProductListSkeleton /> : <ProductGridSkeleton />}
      </div>
    </div>
  );
}
