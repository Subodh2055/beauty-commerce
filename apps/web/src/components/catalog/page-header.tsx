import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  crumbs = [],
  aside,
}: {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: { href: string; label: string }[];
  aside?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="text-xs text-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:text-foreground">Home</Link>
              </li>
              {crumbs.map((c) => (
                <li key={c.href} className="flex items-center gap-1">
                  <span aria-hidden>/</span>
                  <Link href={c.href} className="hover:text-foreground">{c.label}</Link>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="max-w-2xl text-muted">{description}</p>}
      </div>
      {aside}
    </div>
  );
}
