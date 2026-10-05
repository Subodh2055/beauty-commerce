"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, type CSSProperties } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { ProductSummary } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { BottleArt } from "./bottle-art";
import { Magnetic } from "./magnetic";

// Fixed positions (not Math.random) so server and client render identically.
const MIST: Array<[left: string, top: string, size: number, t: number, d: number, x: number, o: number]> = [
  ["8%", "62%", 140, 15, 0, 30, 0.45],
  ["18%", "28%", 90, 12, 2.5, -20, 0.35],
  ["30%", "78%", 180, 18, 1, 40, 0.4],
  ["44%", "18%", 110, 14, 4, 18, 0.3],
  ["56%", "70%", 220, 20, 0.5, -30, 0.45],
  ["66%", "34%", 130, 16, 3, 26, 0.4],
  ["76%", "82%", 160, 17, 5.5, -16, 0.35],
  ["86%", "22%", 100, 13, 1.8, 22, 0.3],
  ["92%", "58%", 190, 19, 6, -26, 0.4],
  ["38%", "48%", 80, 11, 7, 14, 0.25],
];

// Balanced lines that hold at every width from 320px up.
const HEADLINE = [
  ["Scent,", "the", "way"],
  ["it", "was", "meant"],
  ["to", "be", "worn."],
];

export function Hero({ spotlight }: { spotlight: ProductSummary | null }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // Parallax: background drifts slowly, the bottle rises faster, copy eases away.
  const still = (v: number) => (reduce ? 0 : v);
  const yBack = useTransform(scrollYProgress, [0, 1], [0, still(140)]);
  const yBottle = useTransform(scrollYProgress, [0, 1], [0, still(-90)]);
  const rotBottle = useTransform(scrollYProgress, [0, 1], [0, still(-6)]);
  const yCopy = useTransform(scrollYProgress, [0, 1], [0, still(60)]);
  const fadeCopy = useTransform(scrollYProgress, [0, 0.7], [1, reduce ? 1 : 0]);

  let word = 0;
  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-svh items-center overflow-hidden bg-background pt-20"
    >
      {/* Back layer: washes of blush and champagne */}
      <motion.div aria-hidden style={{ y: yBack }} className="absolute inset-0 -z-10">
        <div className="absolute -left-40 top-10 h-136 w-136 rounded-full bg-blush/70 blur-3xl" />
        <div className="absolute -right-32 bottom-0 h-120 w-120 rounded-full bg-gold-soft blur-3xl" />
        <div className="absolute left-1/3 top-1/2 h-72 w-72 rounded-full bg-accent-soft/80 blur-3xl" />
      </motion.div>

      {/* Mist particles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {MIST.map(([left, top, size, t, d, x, o], i) => (
          <span
            key={i}
            className="mist absolute rounded-full bg-surface blur-2xl"
            style={
              {
                left,
                top,
                width: size,
                height: size,
                "--mist-t": `${t}s`,
                "--mist-d": `${d}s`,
                "--mist-x": `${x}px`,
                "--mist-o": o,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="container-x grid w-full items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div style={{ y: yCopy, opacity: fadeCopy }} className="max-w-2xl">
          <p className="eyebrow hero-fade" style={{ "--d": "40ms" } as CSSProperties}>
            Niche perfume · Clean beauty · Nepal
          </p>
          <h1
            id="hero-title"
            className="mt-5 font-display text-5xl leading-[0.98] font-semibold tracking-display sm:text-6xl lg:text-7xl"
          >
            {/* Lines joined by <br> (not block spans) so the whole h1 is one LCP element. */}
            {HEADLINE.map((line, li) => (
              <span key={li}>
                {li > 0 && <br />}
                {line.map((w) => {
                  const i = word++;
                  const italic = w === "worn.";
                  return (
                    <span key={i}>
                      <span
                        className={`hero-word ${italic ? "italic text-accent" : ""}`}
                        style={{ "--i": i } as CSSProperties}
                      >
                        {w}
                      </span>{" "}
                    </span>
                  );
                })}
              </span>
            ))}
          </h1>
          <p
            className="hero-fade mt-6 max-w-lg text-lg leading-relaxed text-muted"
            style={{ "--d": "700ms" } as CSSProperties}
          >
            Rare attars, French niche houses and clean skincare from trusted sellers —
            authenticated, beautifully wrapped and delivered across Nepal.
          </p>
          <div className="hero-fade mt-9 flex flex-wrap items-center gap-4" style={{ "--d": "850ms" } as CSSProperties}>
            <Magnetic>
              <ButtonLink href="/products?product_type=perfume&sort=bestselling" size="lg">
                Discover the collection
              </ButtonLink>
            </Magnetic>
            <ButtonLink href="#notes" size="lg" variant="ghost" className="underline-offset-4 hover:underline">
              Find your scent
            </ButtonLink>
          </div>
        </motion.div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          {/* Parallax (motion, inline transform) and entrance (CSS animation) live on
              separate elements: a filled CSS animation would override the inline transform. */}
          <motion.div style={{ y: yBottle, rotate: rotBottle }} className="relative">
            <div className="hero-fade" style={{ "--d": "300ms" } as CSSProperties}>
              <BottleArt className="mx-auto h-auto w-[min(78vw,26rem)] drop-shadow-[0_40px_60px_rgb(var(--shadow-color)/0.18)]" />
            </div>
          </motion.div>

          {spotlight && (
            <Link
              href={`/products/${spotlight.slug}`}
              className="hero-fade focus-ring absolute bottom-2 left-0 flex max-w-60 items-center gap-3 rounded-card border border-border bg-surface/85 p-2.5 pr-4 shadow-lift backdrop-blur-md transition-transform duration-(--duration-base) ease-luxe hover:-translate-y-1 sm:left-6"
              style={{ "--d": "1100ms" } as CSSProperties}
            >
              {spotlight.primary_image && (
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-control bg-surface-2">
                  <Image
                    src={spotlight.primary_image.url}
                    alt=""
                    fill
                    sizes="56px"
                    preload
                    className="object-cover"
                  />
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-2xs font-semibold tracking-eyebrow text-accent uppercase">
                  This season
                </span>
                <span className="block truncate font-medium">{spotlight.name}</span>
                <span className="block text-sm text-muted">
                  from {formatMoney(spotlight.base_price, spotlight.currency)}
                </span>
              </span>
            </Link>
          )}
        </div>
      </div>

      <div aria-hidden className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-2xs tracking-eyebrow text-muted uppercase sm:flex">
        Scroll
        <span className="block h-10 w-px overflow-hidden bg-border">
          <span className="scroll-cue block h-full w-full bg-foreground/60" />
        </span>
      </div>
    </section>
  );
}
