"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Controller, useFieldArray, useForm, useWatch, type FieldErrors, type Path } from "react-hook-form";
import {
  getBrands,
  getCategoryTree,
  getFragranceFamilies,
  getFragranceNotes,
  type Brand,
  type CategoryTree,
  type FragranceFamily,
  type FragranceNote,
} from "@/lib/api";
import { useVendorApi, VendorApiError, type VendorProductDetail } from "@/lib/vendor";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useVendor } from "@/components/vendor/vendor-shell";
import { ProductStatusPill } from "@/components/vendor/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { AlertIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { MediaDropzone } from "./media-dropzone";
import { NotesPicker } from "./notes-picker";
import {
  PRODUCT_TYPES,
  emptyVariant,
  productSchema,
  toFormValues,
  toPayload,
  type ProductFormValues,
} from "./schema";

function flatten(tree: CategoryTree[], depth = 0): { value: string; label: string }[] {
  return tree.flatMap((c) => [
    { value: c.id, label: `${"— ".repeat(depth)}${c.name}` },
    ...flatten(c.children, depth + 1),
  ]);
}

/** First error message in RHF's nested error tree (for the summary banner). */
function firstErrorPath(errors: FieldErrors, prefix = ""): string | null {
  for (const [k, v] of Object.entries(errors)) {
    if (!v) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof (v as { message?: unknown }).message === "string") return path;
    const nested = firstErrorPath(v as FieldErrors, path);
    if (nested) return nested;
  }
  return null;
}

/**
 * Add / edit a product. react-hook-form + zod validate on blur and on submit;
 * server 422s are mapped back onto the matching fields. "Save draft" only
 * saves; "Submit for review" saves then submits. Editing a live product sends
 * it back to review (the API enforces this).
 */
export function ProductEditor({ product: initial }: { product?: VendorProductDetail }) {
  // The latest saved version (status, rejection note) — updated after every save.
  const [product, setProduct] = useState(initial);
  const api = useVendorApi();
  const router = useRouter();
  const { readOnly, refresh } = useVendor();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<CategoryTree[]>([]);
  const [families, setFamilies] = useState<FragranceFamily[]>([]);
  const [notes, setNotes] = useState<FragranceNote[]>([]);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: toFormValues(initial),
    mode: "onBlur",
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isDirty, submitCount },
  } = form;
  const variants = useFieldArray({ control, name: "variants" });

  useEffect(() => {
    void Promise.all([
      getBrands().then(setBrands),
      getCategoryTree().then(setCategories),
      getFragranceFamilies().then(setFamilies),
      getFragranceNotes().then(setNotes),
    ]).catch(() => toast.error("Couldn't load brands, categories or notes. Reload to try again."));
  }, []);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [isDirty]);

  // useWatch (not watch) keeps this component compatible with the React Compiler.
  const [type, name, metaTitle, metaDescription, shortDescription, slug, watchedVariants] = useWatch({
    control,
    name: ["product_type", "name", "meta_title", "meta_description", "short_description", "slug", "variants"],
  });
  const isFragrance = type === "perfume";
  const categoryOptions = useMemo(() => flatten(categories), [categories]);
  const live = product?.status === "PUBLISHED";

  async function save(values: ProductFormValues, submit: boolean) {
    setSaving(submit ? "submit" : "draft");
    try {
      const payload = toPayload(values);
      let saved = product
        ? await api.updateProduct(product.id, payload)
        : await api.createProduct(payload);
      if (submit && saved.status !== "PENDING") saved = await api.submitProduct(saved.id);
      setProduct(saved);
      reset(toFormValues(saved));
      void refresh();
      toast.success(
        submit || saved.status === "PENDING"
          ? "Sent for review — we'll let you know when it's live"
          : "Draft saved",
      );
      if (!product) router.replace(`/vendor/products/${saved.id}`);
    } catch (err) {
      if (err instanceof VendorApiError && Object.keys(err.fields).length) {
        for (const [path, message] of Object.entries(err.fields)) {
          setError(path as Path<ProductFormValues>, { type: "server", message });
        }
        toast.error("Please fix the highlighted fields");
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't save the product");
      }
    } finally {
      setSaving(null);
    }
  }

  const onInvalid = (errs: FieldErrors<ProductFormValues>) => {
    const path = firstErrorPath(errs);
    if (path) {
      const el = document.querySelector<HTMLElement>(`[name="${path}"]`);
      el?.focus();
    }
  };

  const errorCount = Object.keys(errors).length;
  const err = (path: string): string | undefined => {
    const node = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], errors);
    return (node as { message?: string } | undefined)?.message;
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit((v) => save(v, false), onInvalid)}
      className="space-y-6 pb-24"
      aria-describedby={errorCount && submitCount ? "editor-errors" : undefined}
    >
      {product?.status === "REJECTED" && product.rejection_reason && (
        <p className="flex items-start gap-2.5 rounded-card bg-danger-soft p-4 text-sm text-danger" role="status">
          <AlertIcon width={18} height={18} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Changes requested: </span>
            {product.rejection_reason} Update the product and submit it again.
          </span>
        </p>
      )}
      {live && (
        <p className="rounded-card bg-gold-soft p-4 text-sm" role="status">
          This product is live. Saving changes sends it back for a quick review; it stays hidden until approved.
          Stock-only changes belong in <a href="/vendor/inventory" className="font-medium text-accent underline">Inventory</a>{" "}
          and don&apos;t need review.
        </p>
      )}
      {errorCount > 0 && submitCount > 0 && (
        <p id="editor-errors" role="alert" className="rounded-card border border-danger/40 bg-danger-soft p-4 text-sm text-danger">
          {errorCount === 1 ? "One section needs" : `${errorCount} sections need`} attention before saving.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Section title="Basics">
            <Input label="Product name" required {...register("name")} error={err("name")} />
            <Textarea
              label="Short description"
              rows={2}
              {...register("short_description")}
              error={err("short_description")}
              hint={`Shown on product cards. ${shortDescription.length}/300`}
            />
            <Textarea label="Full description" rows={6} {...register("description")} error={err("description")} />
          </Section>

          <Section title="Photos" description="Bright, square-on shots on a plain background sell best.">
            <Controller
              control={control}
              name="images"
              render={({ field, fieldState }) => (
                <MediaDropzone
                  value={field.value}
                  onChange={(next) => field.onChange(next)}
                  disabled={readOnly}
                  error={fieldState.error?.message}
                />
              )}
            />
          </Section>

          <Section
            title="Sizes & prices"
            description="Each size has its own price and stock. The default size sets the listing price."
          >
            <fieldset>
              <legend className="sr-only">Sizes</legend>
              <ol className="space-y-3">
                {variants.fields.map((f, i) => (
                  <li key={f.id} className="rounded-card border border-border p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Size {i + 1}</p>
                      <div className="flex items-center gap-3">
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="default-variant"
                            checked={!!watchedVariants?.[i]?.is_default}
                            onChange={() =>
                              variants.fields.forEach((_, j) =>
                                setValue(`variants.${j}.is_default`, j === i, { shouldDirty: true }),
                              )
                            }
                            className="h-4 w-4 accent-accent"
                          />
                          Default
                        </label>
                        {variants.fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const wasDefault = !!watchedVariants?.[i]?.is_default;
                              variants.remove(i);
                              if (wasDefault) setValue("variants.0.is_default", true, { shouldDirty: true });
                            }}
                            aria-label={`Remove size ${i + 1}`}
                            className="focus-ring inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-pill text-muted hover:bg-danger-soft hover:text-danger"
                          >
                            <TrashIcon width={16} height={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input label="Name" placeholder="50 ml" {...register(`variants.${i}.name`)} error={err(`variants.${i}.name`)} />
                      <Input
                        label="Size (ml)"
                        inputMode="decimal"
                        placeholder="50"
                        {...register(`variants.${i}.size_ml`)}
                        error={err(`variants.${i}.size_ml`)}
                      />
                      <Input
                        label="SKU"
                        placeholder="Auto if empty"
                        {...register(`variants.${i}.sku`)}
                        error={err(`variants.${i}.sku`)}
                      />
                      <Input
                        label="Price (NPR)"
                        inputMode="decimal"
                        required
                        {...register(`variants.${i}.price`)}
                        error={err(`variants.${i}.price`)}
                      />
                      <Input
                        label="Was (NPR)"
                        inputMode="decimal"
                        hint="Optional, for a sale"
                        {...register(`variants.${i}.compare_at_price`)}
                        error={err(`variants.${i}.compare_at_price`)}
                      />
                      <Input
                        label="Stock"
                        inputMode="numeric"
                        required
                        {...register(`variants.${i}.stock_quantity`)}
                        error={err(`variants.${i}.stock_quantity`)}
                      />
                    </div>
                  </li>
                ))}
              </ol>
              {err("variants") && (
                <p className="mt-2 text-xs font-medium text-danger" role="alert">
                  {err("variants")}
                </p>
              )}
            </fieldset>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => variants.append(emptyVariant(variants.fields.length === 0))}
              disabled={variants.fields.length >= 12}
            >
              <PlusIcon width={15} height={15} /> Add a size
            </Button>
          </Section>

          {isFragrance && (
            <Section title="Fragrance notes" description="Notes power the note filters and “similar scents”.">
              <Controller
                control={control}
                name="notes"
                render={({ field }) => (
                  <NotesPicker notes={notes} value={field.value} onChange={field.onChange} disabled={readOnly} />
                )}
              />
            </Section>
          )}

          <Section title="Search engine listing" description="How the product appears in Google and link previews.">
            <div className="rounded-card border border-border bg-surface-2 p-4" role="group" aria-label="Search result preview">
              <p className="truncate text-xs text-muted">
                beauty.com.np › products › {slug || "your-product"}
              </p>
              <p className="mt-0.5 truncate text-lg text-chart-1">{metaTitle || name || "Product title"}</p>
              <p className="line-clamp-2 text-sm text-muted">
                {metaDescription || shortDescription || "Add a description so shoppers know what makes it special."}
              </p>
            </div>
            <Input
              label="Search title"
              {...register("meta_title")}
              error={err("meta_title")}
              hint={`${metaTitle.length}/70 · leave empty to use the product name`}
            />
            <Textarea
              label="Search description"
              rows={3}
              {...register("meta_description")}
              error={err("meta_description")}
              hint={`${metaDescription.length}/170 · leave empty to use the short description`}
            />
            <Input
              label="URL slug"
              {...register("slug")}
              error={err("slug")}
              hint="Optional. Lowercase words with dashes; made from the name if empty."
            />
          </Section>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status" />
            {product ? (
              <div className="space-y-2 text-sm">
                <ProductStatusPill status={product.status} />
                <p className="text-muted">
                  {product.status === "PENDING"
                    ? "Waiting for review. You can still edit it."
                    : product.status === "PUBLISHED"
                      ? `Live at ${formatMoney(product.base_price, product.currency)}.`
                      : "Not visible in the store."}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">New products start as drafts. Submit when you&apos;re ready.</p>
            )}
          </Card>

          <Section title="Organisation">
            <Input label="SKU" required {...register("sku")} error={err("sku")} hint="Your own product code." />
            <Select label="Type" options={PRODUCT_TYPES} {...register("product_type")} error={err("product_type")} />
            <Select
              label="Brand"
              placeholder="No brand"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              {...register("brand_id")}
            />
            <Select label="Category" placeholder="Choose a category" options={categoryOptions} {...register("category_id")} />
            {isFragrance && (
              <>
                <Select
                  label="Fragrance family"
                  placeholder="Not set"
                  options={families.map((f) => ({ value: f.id, label: f.name }))}
                  {...register("fragrance_family_id")}
                />
                <Select
                  label="For"
                  placeholder="Not set"
                  options={[
                    { value: "WOMEN", label: "Women" },
                    { value: "MEN", label: "Men" },
                    { value: "UNISEX", label: "Unisex" },
                  ]}
                  {...register("gender")}
                />
              </>
            )}
            <Input label="Tags" {...register("tags")} error={err("tags")} hint="Comma separated, e.g. vegan, gift" />
          </Section>
        </div>
      </div>

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="container-x flex h-16 items-center justify-end gap-2">
            <p className="mr-auto hidden text-sm text-muted sm:block" aria-live="polite">
              {isDirty ? "Unsaved changes" : product ? "All changes saved" : ""}
            </p>
            <Button type="submit" variant="outline" loading={saving === "draft"} disabled={saving !== null}>
              {live ? "Save & resubmit" : "Save draft"}
            </Button>
            {!live && product?.status !== "PENDING" && (
              <Button
                type="button"
                loading={saving === "submit"}
                disabled={saving !== null}
                onClick={handleSubmit((v) => save(v, true), onInvalid)}
              >
                Submit for review
              </Button>
            )}
          </div>
        </div>
      )}
    </form>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card as="section">
      <CardHeader title={title} description={description} />
      <div className="space-y-4">{children}</div>
    </Card>
  );
}
