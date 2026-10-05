"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { useVendorApi } from "@/lib/vendor";
import { ChevronIcon, CloseIcon, GripIcon, UploadIcon } from "@/components/ui/icons";

export interface MediaItem {
  id?: string;
  url: string;
  alt: string;
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const MAX_BYTES = 5 * 1024 * 1024;

interface Pending {
  key: string;
  name: string;
  preview: string;
  error?: string;
}

/**
 * Multi-image uploader for product photos.
 * - Drop files anywhere on the zone, or press the button (keyboard/touch).
 * - Each file uploads in parallel to /vendor/uploads (scoped to this store) and
 *   shows a local preview while it travels; bad types/sizes are refused up front.
 * - Order matters: the first photo is the cover. Reorder by dragging the
 *   handle, or with the ← / → buttons (keyboard and screen-reader friendly).
 * - Every photo has its own alt text field.
 */
export function MediaDropzone({
  value,
  onChange,
  max = 10,
  disabled = false,
  error,
}: {
  value: MediaItem[];
  onChange: (next: MediaItem[]) => void;
  max?: number;
  disabled?: boolean;
  error?: string;
}) {
  const api = useVendorApi();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const hintId = useId();
  // The latest list, for uploads that finish after other edits.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(
    () => () => pending.forEach((p) => URL.revokeObjectURL(p.preview)),
    // Revoke on unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function addFiles(files: FileList | File[]) {
    const room = max - value.length - pending.filter((p) => !p.error).length;
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > list.length) setAnnounce(`Only ${max} photos allowed; extra files were skipped.`);
    for (const file of list) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      const preview = URL.createObjectURL(file);
      const problem = !ACCEPT.includes(file.type)
        ? "Use JPEG, PNG, WebP, GIF or AVIF."
        : file.size > MAX_BYTES
          ? "Larger than 5 MB."
          : undefined;
      setPending((p) => [...p, { key, name: file.name, preview, error: problem }]);
      if (problem) continue;
      api
        .upload(file)
        .then((asset) => {
          const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
          latest.current = [...latest.current, { url: asset.url, alt }];
          onChange(latest.current);
          setPending((p) => p.filter((x) => x.key !== key));
          URL.revokeObjectURL(preview);
          setAnnounce(`${file.name} uploaded.`);
        })
        .catch((err) =>
          setPending((p) =>
            p.map((x) => (x.key === key ? { ...x, error: err instanceof Error ? err.message : "Upload failed" } : x)),
          ),
        );
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setAnnounce(`Photo moved to position ${to + 1} of ${value.length}${to === 0 ? ", now the cover" : ""}.`);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
  }

  const full = value.length + pending.filter((p) => !p.error).length >= max;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-6 text-center transition-colors duration-(--duration-fast) ${
          over ? "border-accent bg-accent-soft/40" : error ? "border-danger" : "border-border-strong"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <UploadIcon className="text-muted" />
        <p className="text-sm">
          <span className="font-medium">Drag photos here</span> or{" "}
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={disabled || full}
            aria-describedby={hintId}
            className="focus-ring cursor-pointer rounded-sm font-medium text-accent underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            choose files
          </button>
        </p>
        <p id={hintId} className="text-xs text-muted">
          Up to {max} photos · JPEG, PNG, WebP, GIF or AVIF · 5 MB each. The first photo is the cover.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {(value.length > 0 || pending.length > 0) && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Product photos, in display order">
          {value.map((img, i) => (
            <li
              key={img.id ?? img.url}
              draggable={!disabled}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                move(dragFrom, i);
                setDragFrom(null);
              }}
              onDragEnd={() => setDragFrom(null)}
              className={`group overflow-hidden rounded-card border bg-surface transition-[opacity,border-color] ${
                dragFrom === i ? "opacity-50" : ""
              } ${i === 0 ? "border-accent" : "border-border"}`}
            >
              <div className="relative aspect-4/5 bg-surface-2">
                <Image src={img.url} alt="" fill sizes="200px" className="object-cover" />
                {i === 0 && (
                  <span className="absolute left-2 top-2 rounded-pill bg-primary px-2 py-0.5 text-2xs font-semibold text-primary-foreground">
                    Cover
                  </span>
                )}
                <span
                  aria-hidden
                  className="absolute right-2 top-2 cursor-grab rounded-pill bg-surface/90 p-1 text-muted shadow-hairline"
                  title="Drag to reorder"
                >
                  <GripIcon width={14} height={14} />
                </span>
              </div>
              <div className="space-y-2 p-2">
                <label className="block">
                  <span className="sr-only">Alt text for photo {i + 1}</span>
                  <input
                    value={img.alt}
                    onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
                    placeholder="Describe the photo"
                    maxLength={200}
                    disabled={disabled}
                    className="focus-ring h-8 w-full rounded-control border border-border-strong bg-surface px-2 text-xs placeholder:text-muted"
                  />
                </label>
                <div className="flex items-center justify-between">
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => move(i, i - 1)}
                      disabled={disabled || i === 0}
                      aria-label={`Move photo ${i + 1} earlier`}
                      className="focus-ring inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill text-muted hover:bg-surface-2 disabled:opacity-30"
                    >
                      <ChevronIcon width={14} height={14} className="rotate-180" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, i + 1)}
                      disabled={disabled || i === value.length - 1}
                      aria-label={`Move photo ${i + 1} later`}
                      className="focus-ring inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill text-muted hover:bg-surface-2 disabled:opacity-30"
                    >
                      <ChevronIcon width={14} height={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(value.filter((_, j) => j !== i));
                      setAnnounce(`Photo ${i + 1} removed.`);
                    }}
                    disabled={disabled}
                    aria-label={`Remove photo ${i + 1}`}
                    className="focus-ring inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    <CloseIcon width={14} height={14} />
                  </button>
                </div>
              </div>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key} className="overflow-hidden rounded-card border border-border bg-surface" aria-busy={!p.error}>
              <div className="relative aspect-4/5 bg-surface-2">
                {/* Local blob preview; next/image can't optimise blob: URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" className={`h-full w-full object-cover ${p.error ? "opacity-40" : "animate-pulse opacity-70"}`} />
              </div>
              <div className="flex items-start justify-between gap-2 p-2">
                <p className={`line-clamp-2 text-xs ${p.error ? "text-danger" : "text-muted"}`} role={p.error ? "alert" : undefined}>
                  {p.error ? `${p.name}: ${p.error}` : `Uploading ${p.name}…`}
                </p>
                {p.error && (
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(p.preview);
                      setPending((list) => list.filter((x) => x.key !== p.key));
                    }}
                    aria-label={`Dismiss ${p.name}`}
                    className="focus-ring inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-pill text-muted hover:bg-surface-2"
                  >
                    <CloseIcon width={12} height={12} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
