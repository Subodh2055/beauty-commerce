import { z } from "zod";
import type { ProductWrite, VendorProductDetail } from "@/lib/vendor";

export const PRODUCT_TYPES = [
  { value: "perfume", label: "Perfume" },
  { value: "skincare", label: "Skincare" },
  { value: "lipstick", label: "Lipstick" },
  { value: "foundation", label: "Foundation" },
  { value: "hair_care", label: "Hair care" },
  { value: "body_care", label: "Body care" },
];

/* Numbers stay strings while editing (empty is a valid in-progress state) and
   are validated as text; toPayload converts them once, on save. */
const positive = (msg: string) => z.string().trim().refine((v) => v !== "" && Number(v) > 0, msg);
const optionalPositive = (msg: string) =>
  z.string().trim().refine((v) => v === "" || Number(v) > 0, msg);

export const variantSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name this size, e.g. 50 ml").max(120),
  size_ml: z
    .string()
    .trim()
    .refine((v) => v === "" || (Number(v) > 0 && Number(v) <= 10000), "Between 1 and 10,000 ml"),
  sku: z.string().trim().max(64, "64 characters at most"),
  price: positive("Enter a price above 0"),
  compare_at_price: optionalPositive("Enter a price above 0, or leave empty"),
  stock_quantity: z.string().trim().regex(/^\d+$/, "A whole number, 0 or more"),
  is_default: z.boolean(),
});

export const imageSchema = z.object({
  id: z.string().optional(),
  url: z.string().min(1),
  alt: z.string().trim().max(200, "200 characters at most"),
});

export const productSchema = z
  .object({
    name: z.string().trim().min(2, "Give the product a name").max(200),
    sku: z
      .string()
      .trim()
      .min(1, "Every product needs a SKU")
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dots, dashes and underscores only"),
    product_type: z.string().min(1, "Choose a type"),
    brand_id: z.string(),
    category_id: z.string(),
    gender: z.enum(["", "WOMEN", "MEN", "UNISEX"]),
    fragrance_family_id: z.string(),
    short_description: z.string().trim().max(300, "300 characters at most"),
    description: z.string().trim().max(10000),
    tags: z.string().max(500),
    slug: z
      .string()
      .trim()
      .max(220)
      .refine((v) => v === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), "Lowercase words joined by dashes"),
    meta_title: z.string().trim().max(70, "Search engines cut titles after ~60–70 characters"),
    meta_description: z.string().trim().max(170, "Keep it under 170 characters"),
    images: z.array(imageSchema).max(10, "Up to 10 photos"),
    variants: z.array(variantSchema).min(1, "Add at least one size"),
    notes: z
      .array(z.object({ note_id: z.string(), position: z.enum(["TOP", "HEART", "BASE"]) }))
      .max(60),
  })
  .superRefine((p, ctx) => {
    const names = new Map<string, number>();
    p.variants.forEach((v, i) => {
      const key = v.name.trim().toLowerCase();
      if (names.has(key)) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "name"], message: "Each size needs a different name" });
      }
      names.set(key, i);
      if (v.compare_at_price && Number(v.compare_at_price) <= Number(v.price)) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "compare_at_price"],
          message: "The “was” price must be higher than the price",
        });
      }
    });
  });

export type ProductFormValues = z.input<typeof productSchema>;

export function emptyVariant(isDefault = false): ProductFormValues["variants"][number] {
  return { name: "", size_ml: "", sku: "", price: "", compare_at_price: "", stock_quantity: "0", is_default: isDefault };
}

export function toFormValues(p?: VendorProductDetail): ProductFormValues {
  if (!p) {
    return {
      name: "",
      sku: "",
      product_type: "perfume",
      brand_id: "",
      category_id: "",
      gender: "",
      fragrance_family_id: "",
      short_description: "",
      description: "",
      tags: "",
      slug: "",
      meta_title: "",
      meta_description: "",
      images: [],
      variants: [emptyVariant(true)],
      notes: [],
    };
  }
  const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return {
    name: p.name,
    sku: p.sku,
    product_type: p.product_type,
    brand_id: str(p.brand_id),
    category_id: str(p.category_id),
    gender: (p.gender ?? "") as ProductFormValues["gender"],
    fragrance_family_id: str(p.fragrance_family_id),
    short_description: str(p.short_description),
    description: str(p.description),
    tags: p.tags.join(", "),
    slug: p.slug,
    meta_title: str(p.meta_title),
    meta_description: str(p.meta_description),
    images: [...p.images]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
      .map((i) => ({ id: i.id, url: i.url, alt: str(i.alt) })),
    variants: [...p.variants]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({
        id: v.id,
        name: v.name,
        size_ml: v.size_ml ? String(Number(v.size_ml)) : "",
        sku: v.sku,
        price: String(Number(v.price)),
        compare_at_price: v.compare_at_price ? String(Number(v.compare_at_price)) : "",
        stock_quantity: String(v.stock_quantity),
        is_default: v.is_default,
      })),
    notes: p.notes.map((n) => ({ note_id: n.note_id, position: n.position })),
  };
}

const nullIfEmpty = (v: string) => (v.trim() === "" ? null : v.trim());

/** Form values → the API's ProductWrite. The first photo is the cover. */
export function toPayload(v: ProductFormValues): ProductWrite {
  const defaultIndex = Math.max(0, v.variants.findIndex((x) => x.is_default));
  const variants = v.variants.map((x, i) => ({
    id: x.id ?? null,
    name: x.name.trim(),
    sku: nullIfEmpty(x.sku),
    size_ml: x.size_ml ? Number(x.size_ml) : null,
    price: Number(x.price),
    compare_at_price: x.compare_at_price ? Number(x.compare_at_price) : null,
    stock_quantity: Number(x.stock_quantity),
    is_default: i === defaultIndex,
    sort_order: i,
  }));
  return {
    name: v.name.trim(),
    sku: v.sku.trim(),
    slug: nullIfEmpty(v.slug),
    product_type: v.product_type,
    brand_id: nullIfEmpty(v.brand_id),
    category_id: nullIfEmpty(v.category_id),
    gender: v.gender === "" ? null : v.gender,
    fragrance_family_id: nullIfEmpty(v.fragrance_family_id),
    short_description: nullIfEmpty(v.short_description),
    description: nullIfEmpty(v.description),
    meta_title: nullIfEmpty(v.meta_title),
    meta_description: nullIfEmpty(v.meta_description),
    tags: v.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    notes: v.notes,
    // The listing price is the default size's price.
    base_price: variants[defaultIndex]?.price ?? variants[0].price,
    images: v.images.map((img, i) => ({
      id: img.id ?? null,
      url: img.url,
      alt: nullIfEmpty(img.alt),
      is_primary: i === 0,
      sort_order: i,
    })),
    variants,
  };
}
