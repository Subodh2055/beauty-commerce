"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  useAdmin,
  type AdminProductDetail,
  type AdminImage,
  type AdminVariant,
  type Option,
  type ProductWrite,
} from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/auth/auth-card";
import { TrashIcon, PlusIcon } from "@/components/ui/icons";
import { ImageUpload } from "./image-upload";

const STATUSES = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"];
const TYPES = ["perfume", "skincare", "lipstick", "foundation", "hair_care", "body_care"];

type VariantRow = AdminVariant;
type ImageRow = AdminImage;

function emptyVariant(): VariantRow {
  return { name: "", options: {}, price: 0, stock_quantity: 0, is_default: false, sort_order: 0 };
}
function emptyImage(): ImageRow {
  return { url: "", alt: "", is_primary: false, sort_order: 0 };
}

export function ProductForm({ existing }: { existing?: AdminProductDetail }) {
  const admin = useAdmin();
  const router = useRouter();
  const isEdit = !!existing;

  const [brands, setBrands] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    sku: existing?.sku ?? "",
    name: existing?.name ?? "",
    slug: existing?.slug ?? "",
    short_description: existing?.short_description ?? "",
    description: existing?.description ?? "",
    product_type: existing?.product_type ?? "perfume",
    brand_id: existing?.brand_id ?? "",
    category_id: existing?.category_id ?? "",
    base_price: existing?.base_price ?? "",
    compare_at_price: existing?.compare_at_price ?? "",
    tax_rate: existing?.tax_rate ?? "13",
    status: existing?.status ?? "DRAFT",
    is_featured: existing?.is_featured ?? false,
    tags: (existing?.tags ?? []).join(", "),
    attributes: JSON.stringify(existing?.attributes ?? {}, null, 2),
  });

  const [variants, setVariants] = useState<VariantRow[]>(
    existing?.variants.length ? existing.variants : [{ ...emptyVariant(), is_default: true }],
  );
  const [images, setImages] = useState<ImageRow[]>(existing?.images ?? []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [b, c] = await Promise.all([admin.brandOptions(), admin.categoryOptions()]);
        if (active) {
          setBrands(b);
          setCategories(c);
        }
      } catch {
        /* shell guards access */
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let attributes: Record<string, unknown> = {};
    try {
      attributes = form.attributes.trim() ? JSON.parse(form.attributes) : {};
    } catch {
      setError("Attributes must be valid JSON.");
      return;
    }
    if (variants.some((v) => !v.name || Number(v.price) <= 0)) {
      setError("Every variant needs a name and a price above 0.");
      return;
    }

    const payload: ProductWrite = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      short_description: form.short_description || null,
      description: form.description || null,
      product_type: form.product_type,
      brand_id: form.brand_id || null,
      category_id: form.category_id || null,
      base_price: Number(form.base_price),
      compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
      tax_rate: Number(form.tax_rate),
      status: form.status,
      is_featured: form.is_featured,
      attributes,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      variants: variants.map((v, i) => ({
        ...v,
        price: Number(v.price),
        compare_at_price: v.compare_at_price ? Number(v.compare_at_price) : null,
        stock_quantity: Number(v.stock_quantity),
        sort_order: i,
      })),
      images: images.map((im, i) => ({ ...im, sort_order: i })),
    };

    setBusy(true);
    try {
      const saved = isEdit
        ? await admin.saveProduct(existing.id, payload)
        : await admin.createProduct(payload);
      toast.success(isEdit ? `Saved “${saved.name}”` : `Created “${saved.name}”`);
      router.push(`/admin/products?saved=${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <FormError message={error} />

      <section className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <h2 className="font-serif text-lg font-semibold">Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          <Field label="SKU" name="sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} required />
        </div>
        <Field label="Slug (optional)" name="slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} hint="Auto-generated from the name if left blank." />
        <Field label="Short description" name="short_description" value={form.short_description} onChange={(e) => set("short_description", e.target.value)} />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Description</label>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Type" value={form.product_type} onChange={(v) => set("product_type", v)} options={TYPES.map((t) => ({ id: t, name: t.replace("_", " ") }))} />
          <Select label="Brand" value={form.brand_id} onChange={(v) => set("brand_id", v)} options={brands} placeholder="—" />
          <Select label="Category" value={form.category_id} onChange={(v) => set("category_id", v)} options={categories} placeholder="—" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Base price" name="base_price" type="number" step="0.01" value={String(form.base_price)} onChange={(e) => set("base_price", e.target.value)} required />
          <Field label="Compare-at price" name="compare_at_price" type="number" step="0.01" value={String(form.compare_at_price)} onChange={(e) => set("compare_at_price", e.target.value)} />
          <Field label="Tax rate %" name="tax_rate" type="number" step="0.01" value={String(form.tax_rate)} onChange={(e) => set("tax_rate", e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Status" value={form.status} onChange={(v) => set("status", v)} options={STATUSES.map((s) => ({ id: s, name: s }))} />
          <label className="flex items-end gap-2 pb-2.5 text-sm">
            <input type="checkbox" checked={form.is_featured} onChange={(e) => set("is_featured", e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Featured
          </label>
        </div>
        <Field label="Tags (comma-separated)" name="tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Attributes (JSON)</label>
          <textarea value={form.attributes} onChange={(e) => set("attributes", e.target.value)} rows={6} className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 font-mono text-xs" />
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">Variants</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setVariants((vs) => [...vs, emptyVariant()])}>
            <PlusIcon width={14} height={14} /> Add variant
          </Button>
        </div>
        <div className="space-y-3">
          {variants.map((v, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1.5fr_1fr_1fr_auto_auto]">
              <input aria-label="Variant name" placeholder="Name (e.g. 50 ml)" value={v.name} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="focus-ring h-9 rounded-lg border border-border bg-surface px-2 text-sm" />
              <input aria-label="Price" type="number" step="0.01" placeholder="Price" value={String(v.price)} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className="focus-ring h-9 rounded-lg border border-border bg-surface px-2 text-sm" />
              <input aria-label="Stock" type="number" placeholder="Stock" value={String(v.stock_quantity)} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, stock_quantity: Number(e.target.value) } : x)))} className="focus-ring h-9 rounded-lg border border-border bg-surface px-2 text-sm" />
              <label className="flex items-center gap-1 text-xs">
                <input type="radio" name="default_variant" checked={v.is_default} onChange={() => setVariants((vs) => vs.map((x, j) => ({ ...x, is_default: j === i })))} />
                default
              </label>
              <button type="button" onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))} disabled={variants.length === 1} className="focus-ring rounded-lg p-1.5 text-muted hover:text-danger disabled:opacity-40" aria-label="Remove variant">
                <TrashIcon width={16} height={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

            <section className="space-y-3 rounded-2xl border border-border bg-surface p-6 shadow-soft">
                    <div className="flex items-center justify-between">
                              <h2 className="font-serif text-lg font-semibold">Images</h2>
                                        <Button type="button" variant="outline" size="sm" onClick={() => setImages((im) => [...im, emptyImage()])}>
                                                    <PlusIcon width={14} height={14} /> Add image
                                                              </Button>
                                                                      </div>
                                                                              {images.length === 0 && <p className="text-sm text-muted">No images yet. Add one and upload a file.</p>}
                                                                                      <div className="space-y-3">
                                                                                                {images.map((im, i) => (
                                                                                                            <div key={i} className="space-y-3 rounded-xl border border-border p-3">
                                                                                                                          <ImageUpload
                                                                                                                                          value={im.url}
                                                                                                                                                          onChange={(url) => setImages((xs) => xs.map((x, j) => (j === i ? { ...x, url } : x)))}
                                                                                                                                                                        />
                                                                                                                                                                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                                                                                                                                                                                                      <input aria-label="Alt text" placeholder="Alt text (for accessibility)" value={im.alt ?? ""} onChange={(e) => setImages((xs) => xs.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} className="focus-ring h-9 rounded-lg border border-border bg-surface px-2 text-sm" />
                                                                                                                                                                                                                      <label className="flex items-center gap-1 text-xs">
                                                                                                                                                                                                                                        <input type="radio" name="primary_image" checked={im.is_primary} onChange={() => setImages((xs) => xs.map((x, j) => ({ ...x, is_primary: j === i })))} />
                                                                                                                                                                                                                                                          primary
                                                                                                                                                                                                                                                                          </label>
                                                                                                                                                                                                                                                                                          <button type="button" onClick={() => setImages((xs) => xs.filter((_, j) => j !== i))} className="focus-ring justify-self-start rounded-lg p-1.5 text-muted hover:text-danger" aria-label="Remove image">
                                                                                                                                                                                                                                                                                                            <TrashIcon width={16} height={16} />
                                                                                                                                                                                                                                                                                                                            </button>
                                                                                                                                                                                                                                                                                                                                          </div>
                                                                                                                                                                                                                                                                                                                                                      </div>
                                                                                                                                                                                                                                                                                                                                                                ))}
                                                                                                                                                                                                                                                                                                                                                                        </div>
                                                                                                                                                                                                                                                                                                                                                                              </section>
                                                                                                                                                                                                                                                                                                                                                                              
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create product"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/products")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="focus-ring h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm capitalize">
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
