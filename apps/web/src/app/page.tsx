import type { Metadata } from "next";
import {
  getFeaturedReviews,
  getFragranceFamilies,
  getProduct,
  getProductFacets,
  getProducts,
  type FeaturedReview,
  type ProductDetail,
  type ProductSummary,
} from "@/lib/api";
import { ApiStatus } from "@/components/api-status";
import { BrandStory } from "@/components/landing/brand-story";
import { Bestsellers } from "@/components/landing/bestsellers";
import { CollectionsCarousel, type Collection } from "@/components/landing/collections-carousel";
import { Hero } from "@/components/landing/hero";
import { NotesPyramid } from "@/components/landing/notes-pyramid";
import { SmoothScroll } from "@/components/landing/smooth-scroll";
import { Testimonials } from "@/components/landing/testimonials";
import { VendorCta } from "@/components/landing/vendor-cta";

export const revalidate = 60;

const TITLE = "Beauty — Niche perfume & clean beauty, delivered across Nepal";
const DESCRIPTION =
  "Discover authentic niche perfumes, attars and clean skincare from trusted sellers. Explore by fragrance family or note, with same-day delivery in the Kathmandu Valley.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Beauty",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_NP",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

/** Families with a cover image from their most popular bottle. */
async function loadCollections(): Promise<Collection[]> {
  const [facets, families] = await Promise.all([
    settle(getProductFacets({ product_type: "perfume" })),
    settle(getFragranceFamilies()),
  ]);
  if (!facets) return [];
  const described = new Map((families ?? []).map((f) => [f.slug, f.description]));
  const top = [...facets.families].sort((a, b) => b.count - a.count).slice(0, 8);
  return Promise.all(
    top.map(async (f) => {
      const page = await settle(getProducts({ family: f.slug, sort: "bestselling", size: 1 }));
      const img = page?.items[0]?.primary_image ?? null;
      return {
        slug: f.slug,
        name: f.name,
        count: f.count,
        description: described.get(f.slug) ?? null,
        image: img ? { url: img.url, alt: img.alt ?? f.name } : null,
      };
    }),
  );
}

/** The best-selling perfume that has a full note pyramid. */
async function loadFlagship(): Promise<ProductDetail | null> {
  const perfumes = await settle(getProducts({ product_type: "perfume", sort: "bestselling", size: 6 }));
  for (const p of perfumes?.items ?? []) {
    const detail = await settle(getProduct(p.slug));
    if (detail && detail.notes.top.length + detail.notes.heart.length + detail.notes.base.length > 0) {
      return detail;
    }
  }
  return null;
}

export default async function HomePage() {
  const [bestsellers, collections, flagship, reviews] = await Promise.all([
    settle(getProducts({ sort: "bestselling", size: 8 })),
    loadCollections(),
    loadFlagship(),
    settle(getFeaturedReviews(12)),
  ]);
  const apiDown = !bestsellers && !flagship && collections.length === 0;
  const spotlight: ProductSummary | null = flagship ?? bestsellers?.items[0] ?? null;

  return (
    <>
      <SmoothScroll />
      <JsonLd />
      <Hero spotlight={spotlight} />

      {apiDown && (
        <div className="container-x py-12">
          <div className="max-w-md">
            <ApiStatus />
          </div>
        </div>
      )}

      {collections.length > 0 && <CollectionsCarousel items={collections} />}
      {flagship && (
        <NotesPyramid product={{ name: flagship.name, slug: flagship.slug }} notes={flagship.notes} />
      )}
      {bestsellers && bestsellers.items.length > 0 && <Bestsellers products={bestsellers.items} />}
      <BrandStory />
      <VendorCta />
      <Testimonials reviews={(reviews ?? []) as FeaturedReview[]} />
    </>
  );
}

/** Organization + WebSite (with sitelinks search) structured data. */
function JsonLd() {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Beauty",
      url: site,
      description: DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Beauty",
      url: site,
      potentialAction: {
        "@type": "SearchAction",
        target: `${site}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];
  return (
    <script
      type="application/ld+json"
      // Static JSON built from constants above; `<` is escaped so it can't close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
