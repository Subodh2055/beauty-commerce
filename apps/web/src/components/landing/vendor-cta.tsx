import { ButtonLink } from "@/components/ui/button";

const POINTS = [
  ["Reach shoppers nationwide", "List once and sell to customers across all seven provinces."],
  ["Clear, fair commission", "One published rate, shown on every order — no hidden fees."],
  ["Payouts you can track", "Delivered orders roll into payouts you can follow in your portal."],
];

export function VendorCta() {
  return (
    <section aria-labelledby="vendor-title" className="container-x py-section lg:py-section-lg">
      <div className="relative overflow-hidden rounded-panel bg-gold-soft px-6 py-12 sm:px-12 lg:px-16 lg:py-16">
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blush/70 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="eyebrow">For perfumers &amp; brands</p>
            <h2 id="vendor-title" className="mt-3 font-display text-4xl font-semibold tracking-display sm:text-5xl">
              Become a vendor
            </h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
              Attar houses, indie perfumers and authorised distributors: open a store on Beauty and
              reach shoppers who care about authenticity.
            </p>
            <ButtonLink href="/sell" size="lg" className="mt-8">
              Apply to sell
            </ButtonLink>
          </div>
          <ul className="space-y-5">
            {POINTS.map(([title, body]) => (
              <li key={title} className="flex gap-4">
                <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-pill bg-gold-strong" />
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
