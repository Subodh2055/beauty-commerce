import Link from "next/link";
import type { FeaturedReview } from "@/lib/api";
import { StarIcon } from "@/components/ui/icons";

function Card({ r }: { r: FeaturedReview }) {
  return (
    <figure className="flex w-76 shrink-0 flex-col justify-between rounded-panel border border-border bg-surface p-6 shadow-soft sm:w-96">
      <div>
        <p className="flex gap-0.5 text-gold" role="img" aria-label={`${r.rating} out of 5 stars`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon key={i} width={16} height={16} filled={i < r.rating} aria-hidden />
          ))}
        </p>
        {r.title && <p className="mt-4 font-display text-xl font-semibold">{r.title}</p>}
        <blockquote className="mt-2 text-sm leading-relaxed text-muted">&ldquo;{r.body}&rdquo;</blockquote>
      </div>
      <figcaption className="mt-5 text-sm">
        <span className="font-medium">{r.author}</span>
        <span className="text-muted"> on </span>
        <Link href={`/products/${r.product.slug}`} className="text-accent underline-offset-4 hover:underline">
          {r.product.name}
        </Link>
      </figcaption>
    </figure>
  );
}

/**
 * Real reviews from the API, scrolling as a marquee (CSS transform). Pauses on
 * hover/focus; with reduced motion it's a still, scrollable row and the
 * duplicate copy (there only to make the loop seamless) is removed.
 */
export function Testimonials({ reviews }: { reviews: FeaturedReview[] }) {
  if (reviews.length === 0) return null;
  // Repeat short lists so one copy is wider than the viewport.
  const row = reviews.length < 6 ? [...reviews, ...reviews] : reviews;
  return (
    <section aria-labelledby="reviews-title" className="overflow-hidden bg-background-tint py-section lg:py-section-lg">
      <div className="container-x">
        <p className="eyebrow">From our customers</p>
        <h2 id="reviews-title" className="mt-3 font-display text-4xl font-semibold tracking-display sm:text-5xl">
          Worn, and loved
        </h2>
      </div>
      <div className="marquee no-scrollbar mt-10">
        <div className="marquee-track animate-marquee flex w-max gap-5 px-4">
          <ul className="flex gap-5">
            {row.map((r, i) => (
              <li key={`${r.id}-${i}`}>
                <Card r={r} />
              </li>
            ))}
          </ul>
          <ul className="marquee-dup flex gap-5" aria-hidden inert>
            {row.map((r, i) => (
              <li key={`dup-${r.id}-${i}`}>
                <Card r={r} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
