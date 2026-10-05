"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { ProductImage } from "@/lib/api";
import { ChevronIcon, CloseIcon, ZoomIcon } from "@/components/ui/icons";
import { Portal, useOverlay, usePresence } from "@/components/ui/overlay";
import { MorphImage, productMorphName } from "./product-card";

/**
 * Product gallery.
 * - One scroll-snap track for every screen size: swipe on touch, thumbnails or
 *   arrow keys elsewhere. The first image is preloaded (LCP), the rest lazy.
 * - Hover zoom (mouse only): the image scales 2x around the pointer, transform only.
 * - Click/tap opens a fullscreen lightbox with zoom + pan and keyboard navigation.
 * - The first image shares a view-transition name with the shop card, so it morphs in.
 */
export function Gallery({ images, name, slug }: { images: ProductImage[]; name: string; slug: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const id = useId();

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }, []);

  if (images.length === 0) {
    return (
      <div className="flex aspect-4/5 items-center justify-center rounded-panel bg-surface-2 text-muted">
        No image
      </div>
    );
  }

  function onScroll() {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) setActive(i);
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <div className="relative min-w-0 flex-1">
        <div
          ref={track}
          id={id}
          onScroll={onScroll}
          role="region"
          aria-roledescription="carousel"
          aria-label={`${name} images`}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-panel bg-surface-2"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") goTo(Math.min(images.length - 1, active + 1));
            if (e.key === "ArrowLeft") goTo(Math.max(0, active - 1));
          }}
        >
          {images.map((img, i) => (
            <div
              key={img.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${images.length}`}
              className="relative aspect-4/5 w-full shrink-0 snap-center"
            >
              <ZoomSlide
                img={img}
                alt={img.alt ?? name}
                index={i}
                count={images.length}
                morphName={i === 0 ? productMorphName(slug) : undefined}
                onOpen={() => setLightbox(i)}
              />
            </div>
          ))}
        </div>

        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-pill bg-surface/85 px-3 text-xs font-medium shadow-hairline backdrop-blur"
        >
          <ZoomIcon width={15} height={15} /> Tap to zoom
        </span>

        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 lg:hidden" aria-hidden>
            {images.map((img, i) => (
              <span
                key={img.id}
                className={`h-1.5 rounded-pill transition-[width,background-color] duration-(--duration-base) ${
                  i === active ? "w-5 bg-foreground" : "w-1.5 bg-foreground/35"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {images.length > 1 && (
        <ul className="no-scrollbar hidden gap-2 overflow-x-auto lg:flex lg:w-20 lg:flex-col" aria-label="Choose image">
          {images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-controls={id}
                aria-current={i === active}
                className={`focus-ring relative block h-24 w-20 cursor-pointer overflow-hidden rounded-control border-2 transition-colors duration-(--duration-fast) ${
                  i === active ? "border-accent" : "border-transparent hover:border-border-strong"
                }`}
              >
                <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Lightbox
        images={images}
        name={name}
        index={lightbox}
        onIndex={(i) => {
          setLightbox(i);
          goTo(i);
        }}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}

function ZoomSlide({
  img,
  alt,
  index,
  count,
  morphName,
  onOpen,
}: {
  img: ProductImage;
  alt: string;
  index: number;
  count: number;
  morphName?: string;
  onOpen: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);

  // Mouse-only hover zoom. Writes styles directly: no re-render per pointer move.
  function onMove(e: PointerEvent<HTMLButtonElement>) {
    const el = layer.current;
    if (!el || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    el.style.transform = "scale(2)";
  }
  function onLeave() {
    const el = layer.current;
    if (el) el.style.transform = "";
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      aria-label={`Open image ${index + 1} of ${count} full screen`}
      className="focus-ring absolute inset-0 cursor-zoom-in overflow-hidden"
    >
      <div ref={layer} className="absolute inset-0 transition-transform duration-(--duration-base) ease-standard">
        <MorphImage name={morphName}>
          <Image
            src={img.url}
            alt={alt}
            fill
            preload={index === 0}
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover"
          />
        </MorphImage>
      </div>
    </button>
  );
}

function Lightbox({
  images,
  name,
  index,
  onIndex,
  onClose,
}: {
  images: ProductImage[];
  name: string;
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const { mounted, closing } = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  const zoomLayer = useRef<HTMLDivElement>(null);
  const swipe = useRef<number | null>(null);
  const swiped = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const [shown, setShown] = useState(index ?? 0);
  useOverlay(open, panel, onClose);

  // Remember the last index so the image stays put while closing.
  if (index !== null && index !== shown) {
    setShown(index);
    setZoomed(false);
  }

  const count = images.length;
  const go = useCallback((d: number) => onIndex((shown + d + count) % count), [shown, count, onIndex]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "z" || e.key === "+" || e.key === "-") setZoomed((z) => !z);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, go]);

  if (!mounted) return null;
  const img = images[shown] ?? images[0];

  function pan(e: PointerEvent<HTMLDivElement>) {
    const el = zoomLayer.current;
    if (!el || !zoomed) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  }

  return (
    <Portal>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`${name}, image ${shown + 1} of ${count}`}
        tabIndex={-1}
        className={`fixed inset-0 z-70 flex flex-col bg-ink-fixed text-on-image outline-none ${
          closing ? "opacity-0 transition-opacity duration-(--duration-exit) ease-exit" : "animate-overlay-in"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-4">
          <p className="text-sm tabular-nums" aria-live="polite">
            {shown + 1} / {count}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              aria-pressed={zoomed}
              className="focus-ring inline-flex h-11 cursor-pointer items-center gap-2 rounded-pill px-4 text-sm hover:bg-on-image/10"
            >
              <ZoomIcon width={18} height={18} /> {zoomed ? "Zoom out" : "Zoom in"}
            </button>
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              aria-label="Close"
              className="focus-ring inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-pill hover:bg-on-image/10"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <div
          className={`relative min-h-0 flex-1 overflow-hidden ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          onClick={() => {
            // A swipe ends in a click too; it shouldn't also toggle zoom.
            if (swiped.current) swiped.current = false;
            else setZoomed((z) => !z);
          }}
          onPointerMove={pan}
          onPointerDown={(e) => (swipe.current = zoomed ? null : e.clientX)}
          onPointerUp={(e) => {
            if (swipe.current === null) return;
            const dx = e.clientX - swipe.current;
            swipe.current = null;
            if (Math.abs(dx) > 50) {
              swiped.current = true;
              go(dx < 0 ? 1 : -1);
            }
          }}
        >
          <div
            ref={zoomLayer}
            className="absolute inset-0 transition-transform duration-(--duration-slow) ease-luxe"
            style={{ transform: zoomed ? "scale(2.2)" : undefined }}
          >
            <Image
              key={img.id}
              src={img.url}
              alt={img.alt ?? name}
              fill
              sizes="100vw"
              className="animate-fade-in object-contain"
            />
          </div>
        </div>

        {count > 1 && (
          <div className="flex h-20 shrink-0 items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="focus-ring inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-pill border border-on-image/30 hover:bg-on-image/10"
            >
              <ChevronIcon className="rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="focus-ring inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-pill border border-on-image/30 hover:bg-on-image/10"
            >
              <ChevronIcon />
            </button>
          </div>
        )}
      </div>
    </Portal>
  );
}
