import Link from "next/link";
import type { CategoryTree } from "@/lib/api";
import { NewsletterForm } from "./newsletter-form";
import {
  FacebookIcon,
  InstagramIcon,
  SparkleIcon,
  TiktokIcon,
} from "@/components/ui/icons";

const PAYMENTS = ["eSewa", "Khalti", "Visa", "Mastercard", "COD"];

export function Footer({ categories }: { categories: CategoryTree[] }) {
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      {/* Newsletter band */}
      <div className="border-b border-border bg-gradient-to-br from-surface to-surface-2">
        <div className="container-x flex flex-col items-start justify-between gap-6 py-10 lg:flex-row lg:items-center">
          <div className="max-w-md space-y-1">
            <p className="flex items-center gap-2 font-serif text-xl font-semibold">
              <SparkleIcon width={18} height={18} className="text-gold" />
              Join the list
            </p>
            <p className="text-sm text-muted">
              New arrivals, restocks and members-only offers — no spam, unsubscribe anytime.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </div>

      {/* Link columns */}
      <div className="container-x grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-3 sm:col-span-2 lg:col-span-2">
          <p className="font-serif text-xl font-semibold">
            Beauty<span className="text-accent">.</span>
          </p>
          <p className="max-w-xs text-sm text-muted">
            Perfumes, cosmetics and skincare — curated, honest, and delivered across Nepal.
          </p>
          <div className="flex gap-2 pt-1">
            <Social href="https://instagram.com" label="Instagram">
              <InstagramIcon width={18} height={18} />
            </Social>
            <Social href="https://facebook.com" label="Facebook">
              <FacebookIcon width={18} height={18} />
            </Social>
            <Social href="https://tiktok.com" label="TikTok">
              <TiktokIcon width={18} height={18} />
            </Social>
          </div>
        </div>

        <FooterCol title="Shop">
          {categories.slice(0, 5).map((c) => (
            <FooterLink key={c.id} href={`/categories/${c.slug}`}>
              {c.name}
            </FooterLink>
          ))}
          <FooterLink href="/brands">Brands</FooterLink>
        </FooterCol>

        <FooterCol title="Account">
          <FooterLink href="/account">My account</FooterLink>
          <FooterLink href="/orders">Orders</FooterLink>
          <FooterLink href="/wishlist">Wishlist</FooterLink>
          <FooterLink href="/cart">Cart</FooterLink>
        </FooterCol>

        <FooterCol title="Help">
          <FooterLink href="/help/shipping">Shipping &amp; returns</FooterLink>
          <FooterLink href="/help/authenticity">Authenticity promise</FooterLink>
          <FooterLink href="/help/contact">Contact us</FooterLink>
        </FooterCol>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border">
        <div className="container-x flex flex-col-reverse items-start gap-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Beauty Commerce. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1">We accept</span>
            {PAYMENTS.map((p) => (
              <span
                key={p}
                className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-medium"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-muted transition-colors hover:text-accent">
        {children}
      </Link>
    </li>
  );
}

function Social({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-accent hover:text-accent"
    >
      {children}
    </a>
  );
}
