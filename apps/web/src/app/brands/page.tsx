import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getBrands } from "@/lib/api";
import { PageHeader } from "@/components/catalog/page-header";

export const metadata: Metadata = { title: "Brands" };
// Rendered on demand (fetch-level ISR via next.revalidate) so builds don't need a live API.
export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const brands = await getBrands();
  return (
    <div className="container-x py-10">
      <PageHeader
        title="Brands"
        description="Every house we stock, from Parisian niche to Himalayan botanicals."
        crumbs={[{ href: "/brands", label: "Brands" }]}
      />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {brands.map((b) => (
          <li key={b.id}>
            <Link
              href={`/brands/${b.slug}`}
              className="group focus-ring flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-foreground"
            >
              <div className="relative h-14 w-14 overflow-hidden rounded-full bg-surface-2">
                {b.logo_url && (
                  <Image src={b.logo_url} alt="" fill sizes="56px" className="object-cover" />
                )}
              </div>
              <div>
                <p className="font-medium group-hover:text-accent">{b.name}</p>
                {b.country && <p className="text-xs uppercase tracking-wider text-muted">{b.country}</p>}
              </div>
              {b.description && <p className="line-clamp-2 text-sm text-muted">{b.description}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
