"use client";

import { useEffect, useRef } from "react";
import { BottleArt } from "./bottle-art";

const CHAPTERS = [
  {
    kicker: "01 · Sourced",
    title: "From the houses that make them",
    body: "Every bottle comes straight from the brand or an authorised distributor. No grey market, no decants of unknown origin.",
  },
  {
    kicker: "02 · Curated",
    title: "Chosen by noses, not algorithms",
    body: "Our buyers wear what they list. Independent sellers are reviewed before their first fragrance goes live.",
  },
  {
    kicker: "03 · Delivered",
    title: "To your door, anywhere in Nepal",
    body: "Same-day across the Kathmandu Valley, carefully packed for the mountains, with cash on delivery if you prefer.",
  },
];

/**
 * Pinned, scrubbed story (GSAP + ScrollTrigger). Desktop with motion allowed:
 * the section pins while chapters cross-fade and the bottle turns. Mobile or
 * reduced motion: the same chapters as a plain list.
 *
 * GSAP is imported only when the section comes within ~1.5 screens of view, so
 * it never competes with the hero for the main thread. Everything it creates
 * lives in a gsap.context and is reverted on unmount (tweens, pins and
 * ScrollTriggers), so navigating away leaves no pin-spacers behind.
 */
export function BrandStory() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let revert: (() => void) | undefined;
    let cancelled = false;

    const build = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();
        mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
          el.classList.add("story-active");
          const chapters = gsap.utils.toArray<HTMLElement>(".story-chapter", el);
          gsap.set(chapters.slice(1), { autoAlpha: 0, y: 40 });

          const tl = gsap.timeline({
            defaults: { ease: "power2.inOut" },
            scrollTrigger: {
              trigger: el,
              start: "top top",
              end: () => `+=${window.innerHeight * (CHAPTERS.length - 0.5)}`,
              pin: el.querySelector(".story-pin"),
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          });
          chapters.forEach((ch, i) => {
            if (i === 0) return;
            tl.to(chapters[i - 1], { autoAlpha: 0, y: -40, duration: 0.5 }, i).to(
              ch,
              { autoAlpha: 1, y: 0, duration: 0.5 },
              i + 0.15,
            );
          });
          tl.fromTo(
            ".story-bottle",
            { rotate: -8, scale: 0.92 },
            { rotate: 8, scale: 1.04, duration: CHAPTERS.length, ease: "none" },
            0,
          )
            .fromTo(
              ".story-ring",
              { scale: 0.8, autoAlpha: 0.3 },
              { scale: 1.25, autoAlpha: 0.8, duration: CHAPTERS.length, ease: "none" },
              0,
            )
            .fromTo(
              ".story-progress",
              { scaleX: 1 / CHAPTERS.length },
              { scaleX: 1, duration: CHAPTERS.length - 1, ease: "none" },
              0.5,
            );
          return () => el.classList.remove("story-active");
        });
      }, el);
      revert = () => ctx.revert();
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void build();
        }
      },
      { rootMargin: "150% 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      revert?.();
    };
  }, []);

  return (
    <section ref={root} aria-labelledby="story-title" className="relative bg-ink-fixed text-on-image">
      <div className="story-pin flex min-h-svh items-center overflow-hidden py-section">
        <div className="container-x grid w-full items-center gap-12 md:grid-cols-2">
          <div>
            <h2 id="story-title" className="text-2xs font-semibold tracking-eyebrow text-champagne-fixed uppercase">
              The Beauty promise
            </h2>
            <div className="story-stack mt-6 flex flex-col gap-12">
              {CHAPTERS.map((c) => (
                <article key={c.kicker} className="story-chapter max-w-lg">
                  <p className="text-sm font-semibold tracking-eyebrow text-champagne-fixed uppercase">{c.kicker}</p>
                  <h3 className="mt-3 font-display text-4xl leading-tight font-semibold tracking-display sm:text-5xl">
                    {c.title}
                  </h3>
                  <p className="mt-4 text-lg leading-relaxed text-on-image/85">{c.body}</p>
                </article>
              ))}
            </div>
            <div aria-hidden className="mt-10 hidden h-px w-48 bg-on-image/20 md:block">
              <div className="story-progress h-full origin-left bg-champagne-fixed" />
            </div>
          </div>
          <div aria-hidden className="relative hidden aspect-square md:block">
            <div className="story-ring absolute inset-[8%] rounded-full border border-champagne-fixed/40" />
            <div className="story-ring absolute inset-[20%] rounded-full border border-champagne-fixed/25" />
            <div className="story-bottle absolute inset-[14%]">
              <BottleArt className="h-full w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
