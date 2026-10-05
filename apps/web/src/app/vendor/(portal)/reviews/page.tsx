"use client";

import Link from "next/link";
import { useState } from "react";
import { useLoad } from "@/lib/use-load";
import { useVendorApi, type VendorReviewList } from "@/lib/vendor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { Skeleton } from "@/components/ui/skeleton";
import { StarIcon } from "@/components/ui/icons";

const SIZE = 20;

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex text-gold" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon key={i} width={14} height={14} filled={i < rating} aria-hidden />
      ))}
    </span>
  );
}

export default function VendorReviewsPage() {
  const api = useVendorApi();
  const [rating, setRating] = useState("");
  const [page, setPage] = useState(1);
  const { data } = useLoad<VendorReviewList>(JSON.stringify([rating, page]), () =>
    api.reviews({ rating: rating ? Number(rating) : undefined, page, size: SIZE }),
  );

  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Reviews</h1>
        <p className="text-sm text-muted">What customers say about your products. Names are shortened for privacy.</p>
      </div>

      <Card>
        {!data ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="text-center sm:pr-6">
              <p className="text-5xl font-semibold tabular-nums">{data.count ? Number(data.average).toFixed(1) : "—"}</p>
              <div className="mt-1 flex justify-center">
                <Stars rating={Math.round(Number(data.average))} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {data.count} review{data.count === 1 ? "" : "s"}
              </p>
            </div>
            {/* Each bar is labelled with its star level and count; length is a visual extra. */}
            <ul className="space-y-1.5" aria-label="Rating breakdown">
              {[5, 4, 3, 2, 1].map((s) => {
                const n = data.stars[String(s)] ?? 0;
                return (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span className="w-12 shrink-0 tabular-nums">{s} star</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
                      <span
                        className="block h-full origin-left rounded-pill bg-gold"
                        style={{ transform: `scaleX(${data.count ? n / data.count : 0})` }}
                      />
                    </span>
                    <span className="w-8 text-right text-muted tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      <FilterChips
        label="Filter by rating"
        value={rating}
        onChange={(v) => {
          setRating(v);
          setPage(1);
        }}
        options={[{ value: "", label: "All" }, ...[5, 4, 3, 2, 1].map((s) => ({ value: String(s), label: `${s} ★` }))]}
      />

      {!data ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          title={rating ? `No ${rating}-star reviews` : "No reviews yet"}
          description="Reviews appear here as customers rate your products."
          icon={<StarIcon width={26} height={26} />}
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id} className="rounded-card border border-border bg-surface p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Stars rating={r.rating} />
                  {r.is_verified_purchase && <Badge tone="success">Verified purchase</Badge>}
                </div>
                <p className="text-xs text-muted">
                  {r.author} ·{" "}
                  {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              {r.title && <p className="mt-2 font-medium">{r.title}</p>}
              {r.body && <p className="mt-1 text-sm leading-relaxed text-muted">{r.body}</p>}
              <Link href={`/products/${r.product.slug}`} className="focus-ring mt-3 inline-block rounded-sm text-sm text-accent hover:underline">
                {r.product.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <nav aria-label="Pagination" className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
