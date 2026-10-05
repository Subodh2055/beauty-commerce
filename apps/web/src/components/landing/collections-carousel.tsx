"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, type PointerEvent } from "react";
import { motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { ChevronIcon } from "@/components/ui/icons";

// Client-side navigation with motion styles.
const MotionLink = motion.create(Link);

export interface Collection {
  slug: string;
  name: string;
  count: number;
  description: string | null;
  image: { url: string; alt: string } | null;
}

/** Card that tilts toward the pointer (mouse/pen only, transform only). */
function TiltCard({ c, index }: { c: Collection; index: number }) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 180, damping: 18 });
  const sry = useSpring(ry, { stiffness: 180, damping: 18 });
  const transform = useMotionTemplate`perspective(900px) rotateX(${srx}deg) rotateY(${sry}deg)`;

  function onMove(e: PointerEvent<HTMLAnchorElement>) {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * 10);
    rx.set(-py * 10);
  }
  function reset() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <motion.li
      className="w-[78vw] shrink-0 snap-start sm:w-88"
      initial={reduce ? false : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.7, delay: Math.min(index, 4) * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <MotionLink
        href={`/products?family=${c.slug}`}
        onPointerMove={onMove}
        onPointerLeave={reset}
        style={{ transform }}
        className="group focus-ring relative block aspect-[3/4] overflow-hidden rounded-panel bg-surface-2 shadow-soft"
      >
        {c.image && (
          <Image
            src={c.image.url}
            alt=""
            fill
            sizes="(min-width: 640px) 22rem, 78vw"
            className="object-cover transition-transform duration-(--duration-slower) ease-luxe group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-image-scrim/80 via-image-scrim/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-on-image">
          <p className="text-2xs font-semibold tracking-eyebrow uppercase opacity-90">
            {c.count} {c.count === 1 ? "fragrance" : "fragrances"}
          </p>
          <p className="mt-1 font-display text-3xl font-semibold">{c.name}</p>
          {c.description && <p className="mt-2 line-clamp-2 text-sm opacity-90">{c.description}</p>}
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
            Explore
            <ChevronIcon width={16} height={16} className="transition-transform duration-(--duration-base) group-hover:translate-x-1" />
          </span>
        </div>
      </MotionLink>
    </motion.li>
  );
}

export function CollectionsCarousel({ items }: { items: Collection[] }) {
  const track = useRef<HTMLUListElement>(null);
  const reduce = useReducedMotion();

  function scrollByCard(dir: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = (card?.getBoundingClientRect().width ?? 320) + 16;
    el.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <section aria-labelledby="collections-title" className="py-section lg:py-section-lg">
      <div className="container-x flex items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Collections</p>
          <h2 id="collections-title" className="mt-3 font-display text-4xl font-semibold tracking-display sm:text-5xl">
            Explore by family
          </h2>
          <p className="mt-3 max-w-md text-muted">
            Every fragrance belongs to a family. Start with the mood, and we&rsquo;ll show you the bottles.
          </p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            aria-controls="collections-track"
            aria-label="Previous collections"
            className="focus-ring inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-pill border border-border-strong transition-colors duration-(--duration-fast) hover:bg-surface-2"
          >
            <ChevronIcon className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            aria-controls="collections-track"
            aria-label="Next collections"
            className="focus-ring inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-pill border border-border-strong transition-colors duration-(--duration-fast) hover:bg-surface-2"
          >
            <ChevronIcon />
          </button>
        </div>
      </div>
      <ul
        id="collections-track"
        ref={track}
        className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-6 sm:scroll-px-6 sm:px-6 lg:scroll-px-10 lg:px-10 xl:scroll-px-14 xl:px-14"
      >
        {items.map((c, i) => (
          <TiltCard key={c.slug} c={c} index={i} />
        ))}
      </ul>
    </section>
  );
}
