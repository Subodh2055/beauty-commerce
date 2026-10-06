"use client";

import Link from "next/link";
import type { ForYou as ForYouData } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { read } from "@/lib/http";
import { useLoad } from "@/lib/use-load";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoredGrid } from "./scored-grid";

/** Picks from the signed-in shopper's orders and wishlist (or bestsellers until there's history). */
export function ForYou() {
  const { authFetch } = useAuth();
  const { data } = useLoad("for-you", () =>
    authFetch("/recommendations/for-you?limit=4").then((r) => read<ForYouData>(r)),
  );
  if (data && data.results.length === 0) return null;
  return (
    <section aria-labelledby="for-you-h" className="rounded-panel border border-border bg-surface p-6 shadow-soft">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="for-you-h" className="font-display text-xl font-semibold">
            Picked for you
          </h2>
          <p className="text-sm text-muted">
            {data?.basis === "popular"
              ? "Our most loved scents. Wishlist or order a few and these become personal."
              : "Based on what you've ordered and wishlisted."}
          </p>
        </div>
        <Link href="/find-your-scent" className="focus-ring rounded-sm text-sm font-medium text-accent hover:underline">
          Take the scent quiz
        </Link>
      </div>
      {data ? (
        <ScoredGrid items={data.results} showMatch={data.basis === "history"} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5]" />
          ))}
        </div>
      )}
    </section>
  );
}
