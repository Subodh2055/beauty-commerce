import Image from "next/image";
import Link from "next/link";
import { getCategoryTree, getProducts, type CategoryTree, type ProductSummary } from "@/lib/api";
import { ButtonLink } from "@/components/ui/button";
import { ChevronIcon, SparkleIcon } from "@/components/ui/icons";
import { ProductGrid } from "@/components/product/product-grid";
import { Reveal } from "@/components/ui/reveal";
import { ApiStatus } from "@/components/api-status";

export const revalidate = 60;

async function load() {
  try {
    const [featured, newest, categories] = await Promise.all([
      getProducts({ featured: true, sort: "featured", size: 8 }),
      getProducts({ sort: "newest", size: 8 }),
      getCategoryTree(),
    ]);
    return { ok: true as const, featured: featured.items, newest: newest.items, categories };
  } catch {
    return { ok: false as const, featured: [], newest: [], categories: [] as CategoryTree[] };
  }
}

export default async function HomePage() {
  const data = await load();

  return (
    <>
      <Hero />
      <div className="container-x space-y-20 py-14">
        {!data.ok && (
          <section className="max-w-md">
            <ApiStatus />
          </section>
        )}
        {data.categories.length > 0 && <CategoryTiles categories={data.categories} />}
        {data.featured.length > 0 && (
          <Section title="Featured" href="/products?featured=true" products={data.featured} />
        )}
        <TrustBar />
        {data.newest.length > 0 && (
          <Section title="New arrivals" href="/products?sort=newest" products={data.newest} />
        )}
      </div>
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-background-tint via-background to-accent-soft/40">
      {/* soft floating blobs */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl animate-float" />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-gold/10 blur-3xl animate-float"
        style={{ animationDelay: "1.5s" }}
      />
      <div className="container-x relative grid min-h-[520px] items-center gap-10 py-16 lg:grid-cols-2">
        <div className="space-y-6">
          <p
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium shadow-soft backdrop-blur animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            <SparkleIcon width={14} height={14} className="text-accent animate-float" />
            AI-assisted fragrance finder coming soon
          </p>
          <h1
            className="font-serif text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl animate-fade-up"
            style={{ animationDelay: "140ms" }}
          >
            Scents and skincare,
            <br />
            <span className="text-accent">chosen with care.</span>
          </h1>
          <p
            className="max-w-lg text-lg text-muted animate-fade-up"
            style={{ animationDelay: "220ms" }}
          >
            Niche perfumes, clean skincare and high-pigment colour — 100% authentic,
            delivered across Nepal.
          </p>
          <div
            className="flex flex-wrap gap-3 animate-fade-up"
            style={{ animationDelay: "300ms" }}
          >
            <ButtonLink href="/products" size="lg">
              Shop all
            </ButtonLink>
            <ButtonLink href="/categories/perfumes" size="lg" variant="outline">
              Explore perfumes
            </ButtonLink>
          </div>
        </div>
        <div className="relative hidden aspect-[5/4] lg:block animate-scale-in" style={{ animationDelay: "200ms" }}>
          <div className="absolute inset-y-6 left-10 right-0 rounded-[2rem] bg-accent/10" />
          <div className="absolute inset-0 overflow-hidden rounded-[2rem] shadow-lift">
            <Image
              src="https://picsum.photos/seed/beauty-hero/1200/960"
              alt=""
              fill
              priority
              sizes="50vw"
              className="object-cover transition-transform duration-[3s] ease-out hover:scale-105"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryTiles({ categories }: { categories: CategoryTree[] }) {
  return (
    <section aria-labelledby="cats">
      <Reveal index={0}>
        <h2 id="cats" className="mb-6 font-serif text-2xl font-semibold">
          Shop by category
        </h2>
      </Reveal>
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-5">
        {categories.map((c, i) => (
          <Reveal key={c.id} index={i} className="w-64 shrink-0 sm:w-auto">
            <Link
              href={`/categories/${c.slug}`}
              className="group focus-ring relative block aspect-[4/3] overflow-hidden rounded-2xl bg-surface-2 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
            >
              {c.image_url && (
                <Image
                  src={c.image_url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 256px"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
                <span className="font-medium">{c.name}</span>
                <ChevronIcon
                  width={18}
                  height={18}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Section({
  title,
  href,
  products,
}: {
  title: string;
  href: string;
  products: ProductSummary[];
}) {
  return (
    <section aria-labelledby={title}>
      <Reveal>
        <div className="mb-6 flex items-end justify-between">
          <h2 id={title} className="font-serif text-2xl font-semibold sm:text-3xl">
            {title}
          </h2>
          <Link
            href={href}
            className="group inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            View all
            <ChevronIcon
              width={16}
              height={16}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </Link>
        </div>
      </Reveal>
      <ProductGrid products={products} />
    </section>
  );
}

function TrustBar() {
  const items = [
    ["100% authentic", "Sourced directly from brands and authorised distributors."],
    ["Fast delivery", "Same-day in Kathmandu Valley, 2–4 days nationwide."],
    ["Easy returns", "7-day returns on unopened items, no questions asked."],
    ["Pay your way", "eSewa, Khalti, cards and cash on delivery."],
  ];
  return (
    <section className="grid gap-4 rounded-3xl border border-border bg-gradient-to-br from-surface to-surface-2 p-6 shadow-soft sm:grid-cols-2 lg:grid-cols-4 lg:p-8">
      {items.map(([t, d], i) => (
        <Reveal key={t} index={i} className="space-y-1">
          <p className="flex items-center gap-2 font-medium">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            {t}
          </p>
          <p className="text-sm text-muted">{d}</p>
        </Reveal>
      ))}
    </section>
  );
}
