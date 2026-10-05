"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAccount, useReviews, type MyReview } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { AccountShell } from "@/components/account/account-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { StarIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyReviewsPage() {
  return (
    <AccountShell
      title="Your reviews"
      crumbs={[
        { href: "/account", label: "Account" },
        { href: "/account/reviews", label: "Reviews" },
      ]}
    >
      <ReviewList />
    </AccountShell>
  );
}

function ReviewList() {
  const { myReviews } = useAccount();
  const { remove } = useReviews();
  const reduce = useReducedMotion();
  const [items, setItems] = useState<MyReview[] | null>(null);

  useEffect(() => {
    let active = true;
    myReviews()
      .then((r) => active && setItems(r))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDelete(r: MyReview) {
    const ok = await confirmDialog({
      title: "Delete this review?",
      description: `Your review of ${r.product.name} will be removed for everyone.`,
      confirmLabel: "Delete review",
      tone: "danger",
    });
    if (!ok) return;
    const before = items;
    setItems((list) => list?.filter((x) => x.id !== r.id) ?? null); // optimistic
    try {
      await remove(r.product.slug);
      toast.info("Review deleted");
    } catch (err) {
      setItems(before);
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  if (items === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No reviews yet"
        description="Reviews from verified buyers help everyone choose. Rate something you've tried from its product page."
        icon={<StarIcon width={26} height={26} />}
        action={<ButtonLink href="/orders">Review a past order</ButtonLink>}
      />
    );
  }

  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false}>
        {items.map((r) => (
          <motion.li
            key={r.id}
            layout={!reduce}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24, transition: { duration: 0.18 } }}
            className="flex gap-4 rounded-card border border-border bg-surface p-4 shadow-soft sm:p-5"
          >
            <Link
              href={`/products/${r.product.slug}`}
              className="relative h-24 w-20 shrink-0 overflow-hidden rounded-control bg-surface-2"
              tabIndex={-1}
              aria-hidden
            >
              {r.product.image_url && <Image src={r.product.image_url} alt="" fill sizes="80px" className="object-cover" />}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/products/${r.product.slug}`} className="focus-ring rounded-sm font-medium hover:text-accent">
                  {r.product.name}
                </Link>
                <p className="text-xs text-muted">
                  {new Date(r.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <p className="mt-1 flex items-center gap-2" role="img" aria-label={`${r.rating} out of 5 stars`}>
                <span className="flex text-gold">
                  {Array.from({ length: 5 }, (_, i) => (
                    <StarIcon key={i} width={14} height={14} filled={i < r.rating} />
                  ))}
                </span>
                {r.is_verified_purchase && <Badge tone="success">Verified purchase</Badge>}
              </p>
              {r.title && <p className="mt-2 text-sm font-medium">{r.title}</p>}
              {r.body && <p className="mt-1 line-clamp-3 text-sm text-muted">{r.body}</p>}
              <div className="mt-3 flex gap-4 text-sm">
                <Link href={`/products/${r.product.slug}#reviews-heading`} className="focus-ring rounded-sm font-medium text-accent hover:underline">
                  Edit
                </Link>
                <button type="button" onClick={() => onDelete(r)} className="focus-ring cursor-pointer rounded-sm text-muted hover:text-danger">
                  Delete
                </button>
              </div>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
