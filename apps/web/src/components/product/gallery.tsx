"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProductImage } from "@/lib/api";

export function Gallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  if (!current) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center rounded-3xl bg-surface-2 text-muted">
        No image
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <div className="relative aspect-[4/5] flex-1 overflow-hidden rounded-3xl bg-surface-2">
        <Image
          key={current.id}
          src={current.url}
          alt={current.alt ?? name}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
      {images.length > 1 && (
        <ul
          className="no-scrollbar flex gap-2 overflow-x-auto lg:w-20 lg:flex-col"
          aria-label="Product images"
        >
          {images.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === active}
                className={`focus-ring relative block h-20 w-16 overflow-hidden rounded-xl border-2 transition-colors ${
                  i === active ? "border-accent" : "border-transparent hover:border-border"
                }`}
              >
                <Image
                  src={img.url}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
