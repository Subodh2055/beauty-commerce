"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, useReviews, type Review, type ReviewList } from "@/lib/auth";
import { toast } from "@/lib/toast";
// useEffect is used by the list-loading effect below.
import { Rating } from "./rating";
import { StarInput } from "./star-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/auth/auth-card";
import { Skeleton } from "@/components/ui/skeleton";

export function Reviews({ slug }: { slug: string }) {
  const { user, ready } = useAuth();
  const { list, submit, remove } = useReviews();
  const [data, setData] = useState<ReviewList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    (async () => {
      try {
        const res = await list(slug);
        if (active) setData(res);
      } catch {
        if (active) setData({ items: [], total: 0, page: 1, size: 50, breakdown: { average: "0", count: 0, stars: {} }, my_review: null });
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, slug, reloadKey]);

  return (
    <section aria-labelledby="reviews-heading" className="mt-16 border-t border-border pt-12">
      <h2 id="reviews-heading" className="mb-6 font-serif text-2xl font-semibold">
        Reviews
      </h2>

      {data === null ? (
        <Skeleton className="h-32 max-w-sm" />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
          <div className="space-y-6">
            <Summary data={data} />
            <WriteReview
              key={data.my_review?.id ?? "new"}
              slug={slug}
              user={user}
              existing={data.my_review}
              onSaved={() => setReloadKey((k) => k + 1)}
              onDeleted={() => setReloadKey((k) => k + 1)}
              submit={submit}
              remove={remove}
              error={error}
              setError={setError}
            />
          </div>
          <ReviewItems items={data.items} />
        </div>
      )}
    </section>
  );
}

function Summary({ data }: { data: ReviewList }) {
  const { average, count, stars } = data.breakdown;
  return (
    <div className="rounded-2xl bg-surface-2 p-5">
      <div className="flex items-end gap-3">
        <span className="font-serif text-4xl font-semibold">{Number(average).toFixed(1)}</span>
        <div className="pb-1">
          <Rating value={average} showCount={false} />
          <p className="text-xs text-muted">{count} review{count === 1 ? "" : "s"}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5">
        {[5, 4, 3, 2, 1].map((s) => {
          const n = stars[String(s)] ?? 0;
          const pct = count ? Math.round((n / count) * 100) : 0;
          return (
            <li key={s} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-muted">{s}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <span className="block h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
              </span>
              <span className="w-6 text-right text-muted tabular-nums">{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function WriteReview({
  slug,
  user,
  existing,
  onSaved,
  onDeleted,
  submit,
  remove,
  error,
  setError,
}: {
  slug: string;
  user: ReturnType<typeof useAuth>["user"];
  existing: Review | null;
  onSaved: () => void;
  onDeleted: () => void;
  submit: ReturnType<typeof useReviews>["submit"];
  remove: ReturnType<typeof useReviews>["remove"];
  error: string | null;
  setError: (s: string | null) => void;
}) {
  // Initialised from `existing`; the parent passes a key so this remounts when
  // the user's review changes, re-seeding the rating.
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="rounded-2xl border border-border p-5 text-sm">
        <p className="mb-3 text-muted">Sign in to write a review.</p>
        <Link
          href={`/login?next=/products/${slug}`}
          className="font-medium text-accent hover:underline"
        >
          Sign in →
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (rating < 1) {
      setError("Please choose a star rating.");
      return;
    }
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await submit(slug, {
        rating,
        title: String(fd.get("title")) || undefined,
        body: String(fd.get("body")) || undefined,
      });
      toast.success(existing ? "Review updated" : "Thanks for your review!");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete your review?")) return;
    setBusy(true);
    try {
      await remove(slug);
      setRating(0);
      toast.info("Review removed");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border p-5">
      <p className="text-sm font-medium">{existing ? "Edit your review" : "Write a review"}</p>
      <FormError message={error} />
      <StarInput value={rating} onChange={setRating} />
      <Field label="Title" name="title" defaultValue={existing?.title ?? ""} placeholder="Sum it up" />
      <div className="space-y-1.5">
        <label htmlFor="body" className="block text-sm font-medium">
          Review
        </label>
        <textarea
          id="body"
          name="body"
          rows={4}
          defaultValue={existing?.body ?? ""}
          placeholder="What did you think?"
          className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm placeholder:text-muted"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? "Saving…" : existing ? "Update review" : "Submit review"}
        </Button>
        {existing && (
          <Button type="button" variant="outline" onClick={onDelete} disabled={busy}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

function ReviewItems({ items }: { items: Review[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted">No reviews yet. Be the first to share your thoughts.</p>
    );
  }
  return (
    <ul className="space-y-6">
      {items.map((r) => (
        <li key={r.id} className="border-b border-border pb-6 last:border-0">
          <div className="flex flex-wrap items-center gap-2">
            <Rating value={r.rating} showCount={false} />
            {r.is_verified_purchase && <Badge tone="success">Verified purchase</Badge>}
          </div>
          {r.title && <p className="mt-2 font-medium">{r.title}</p>}
          {r.body && <p className="mt-1 text-sm text-muted">{r.body}</p>}
          <p className="mt-2 text-xs text-muted">
            {r.author_name} ·{" "}
            {new Date(r.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </li>
      ))}
    </ul>
  );
}
