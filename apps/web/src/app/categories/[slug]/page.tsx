import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ApiRequestError, getCategory, getCategoryTree, type CategoryTree } from "@/lib/api";
import { PageHeader } from "@/components/catalog/page-header";
import { ProductListing, parseQuery } from "@/components/catalog/product-listing";
import { ProductGridSkeleton } from "@/components/ui/skeleton";

async function loadCategory(slug: string) {
  try {
    return await getCategory(slug);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
}

function findNode(tree: CategoryTree[], slug: string): CategoryTree | null {
  for (const n of tree) {
    if (n.slug === slug) return n;
    const hit = findNode(n.children, slug);
    if (hit) return hit;
  }
  return null;
}

function findParent(tree: CategoryTree[], slug: string): CategoryTree | null {
  for (const n of tree) {
    if (n.children.some((c) => c.slug === slug)) return n;
    const hit = findParent(n.children, slug);
    if (hit) return hit;
  }
  return null;
}

export async function generateMetadata(props: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const c = await loadCategory(slug);
  return { title: c.name, description: c.description ?? undefined };
}

export default async function CategoryPage(props: PageProps<"/categories/[slug]">) {
  const [{ slug }, sp] = await Promise.all([props.params, props.searchParams]);
  const [category, tree] = await Promise.all([loadCategory(slug), getCategoryTree()]);
  const node = findNode(tree, slug);
  const parent = findParent(tree, slug);
  const query = parseQuery(sp, { category: slug });

  const crumbs = [
    ...(parent ? [{ href: `/categories/${parent.slug}`, label: parent.name }] : []),
    { href: `/categories/${slug}`, label: category.name },
  ];

  return (
    <div className="container-x py-10">
      <PageHeader title={category.name} description={category.description} crumbs={crumbs} />

      {node && node.children.length > 0 && (
        <nav className="no-scrollbar -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Subcategories">
          {node.children.map((c) => (
            <Link
              key={c.id}
              href={`/categories/${c.slug}`}
              className="focus-ring shrink-0 rounded-full border border-border px-4 py-1.5 text-sm hover:border-foreground"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <Suspense key={JSON.stringify(query)} fallback={<ProductGridSkeleton />}>
        <ProductListing query={query} pathname={`/categories/${slug}`} lock={{ category: true }} />
      </Suspense>
    </div>
  );
}
