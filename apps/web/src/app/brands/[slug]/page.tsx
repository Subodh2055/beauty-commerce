import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApiRequestError, getBrand } from "@/lib/api";
import { PageHeader } from "@/components/catalog/page-header";
import { ProductListing, parseQuery } from "@/components/catalog/product-listing";
import { ProductGridSkeleton } from "@/components/ui/skeleton";

async function loadBrand(slug: string) {
  try {
    return await getBrand(slug);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata(props: PageProps<"/brands/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const b = await loadBrand(slug);
  return { title: b.name, description: b.description ?? undefined };
}

export default async function BrandPage(props: PageProps<"/brands/[slug]">) {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const brand = await loadBrand(slug);
  const query = parseQuery(sp, { brand: slug });

  return (
    <div className="container-x py-10">
      <PageHeader
        title={brand.name}
        description={brand.description}
        crumbs={[
          { href: "/brands", label: "Brands" },
          { href: `/brands/${slug}`, label: brand.name },
        ]}
        aside={
          brand.logo_url ? (
            <div className="relative h-20 w-20 overflow-hidden rounded-full bg-surface-2">
              <Image src={brand.logo_url} alt="" fill sizes="80px" className="object-cover" />
            </div>
          ) : null
        }
      />
      <Suspense key={JSON.stringify(query)} fallback={<ProductGridSkeleton />}>
        <ProductListing query={query} pathname={`/brands/${slug}`} lock={{ brand: true }} />
      </Suspense>
    </div>
  );
}
