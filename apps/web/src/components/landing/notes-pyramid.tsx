"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { FragranceNote, NotePyramid } from "@/lib/api";
import { ButtonLink } from "@/components/ui/button";

const TIERS: Array<{
  key: keyof NotePyramid;
  label: string;
  timing: string;
  copy: string;
  width: string;
}> = [
  {
    key: "top",
    label: "Top notes",
    timing: "First 15 minutes",
    copy: "The bright first impression — citrus, spice, a flash of green.",
    width: "w-[62%]",
  },
  {
    key: "heart",
    label: "Heart notes",
    timing: "2 – 4 hours",
    copy: "The character of the fragrance, blooming as the top fades.",
    width: "w-[80%]",
  },
  {
    key: "base",
    label: "Base notes",
    timing: "All day",
    copy: "Woods, resins and musks that linger on skin and fabric.",
    width: "w-full",
  },
];

function NoteChip({ note }: { note: FragranceNote }) {
  return (
    <Link
      href={`/products?note=${note.slug}`}
      className="focus-ring inline-flex h-9 items-center rounded-pill border border-border-strong bg-surface px-3.5 text-sm transition-[transform,background-color] duration-(--duration-fast) ease-standard hover:-translate-y-0.5 hover:bg-accent-soft"
    >
      {note.name}
    </Link>
  );
}

/**
 * The note pyramid of a real bestseller, tier by tier. Each note opens the
 * catalogue filtered to that note (the scent finder).
 */
export function NotesPyramid({
  product,
  notes,
}: {
  product: { name: string; slug: string };
  notes: NotePyramid;
}) {
  const reduce = useReducedMotion();
  return (
    <section
      id="notes"
      aria-labelledby="notes-title"
      className="scroll-mt-20 bg-background-tint py-section lg:py-section-lg"
    >
      <div className="container-x grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="eyebrow">The note pyramid</p>
          <h2 id="notes-title" className="mt-3 font-display text-4xl font-semibold tracking-display sm:text-5xl">
            How a fragrance unfolds
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted">
            Perfume changes as it wears. Here is how{" "}
            <Link href={`/products/${product.slug}`} className="font-medium text-accent underline-offset-4 hover:underline">
              {product.name}
            </Link>{" "}
            moves from first spray to dry-down. Tap any note to find every fragrance that shares it.
          </p>
          <ButtonLink href="/products?product_type=perfume&sort=bestselling" variant="outline" className="mt-8">
            Open the scent finder
          </ButtonLink>
        </div>

        <ol className="flex flex-col items-center gap-3" aria-label={`Note pyramid of ${product.name}`}>
          {TIERS.map((tier, i) => {
            const items = notes[tier.key];
            if (items.length === 0) return null;
            return (
              <motion.li
                key={tier.key}
                className={`${tier.width} rounded-panel border border-border bg-surface/80 p-5 text-center shadow-soft backdrop-blur-sm`}
                initial={reduce ? false : { opacity: 0, y: 28, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-15% 0px" }}
                transition={{ duration: 0.7, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="flex flex-wrap items-baseline justify-center gap-x-2">
                  <span className="font-display text-2xl font-semibold">{tier.label}</span>
                  <span className="text-2xs font-semibold tracking-eyebrow text-gold-strong uppercase">
                    {tier.timing}
                  </span>
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{tier.copy}</p>
                <ul className="mt-4 flex flex-wrap justify-center gap-2">
                  {items.map((n) => (
                    <li key={n.id}>
                      <NoteChip note={n} />
                    </li>
                  ))}
                </ul>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
