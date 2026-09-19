"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useAdmin } from "@/lib/auth";
import { toast } from "@/lib/toast";

/**
 * Uploads an image file to the admin uploads endpoint and reports back the
 * stored URL. Shows a thumbnail preview when a URL is present.
 */
export function ImageUpload({
  value,
  onChange,
  label = "Image",
  aspect = "aspect-square",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: string;
}) {
  const admin = useAdmin();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await admin.uploadImage(file);
      onChange(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${aspect} w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2`}>
        {value ? (
          <Image src={value} alt="" fill sizes="64px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-[10px] text-muted">
            none
          </span>
        )}
      </div>
      <div className="flex-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="focus-ring inline-flex h-9 items-center rounded-full border border-border px-4 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? "Uploading…" : value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="focus-ring inline-flex h-9 items-center rounded-full px-3 text-sm text-muted hover:text-danger"
            >
              Remove
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">JPEG, PNG, WebP, GIF or AVIF · up to 5 MB.</p>
      </div>
    </div>
  );
}
