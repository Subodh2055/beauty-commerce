import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sell on Beauty",
  description:
    "Open a store on Beauty: reach fragrance and beauty shoppers across Nepal with clear commission and tracked payouts.",
  alternates: { canonical: "/sell" },
};

const STEPS = [
  ["Apply", "Tell us about your store. It takes about five minutes."],
  ["Get reviewed", "Our team checks your documents and replies within a few working days."],
  ["List and sell", "Add products, submit them for review, and start shipping orders."],
];

export default function SellPage() {
  return (
    <div className="container-x grid gap-12 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
      <div>
        <p className="eyebrow">Become a vendor</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-display sm:text-5xl">
          Sell your fragrances to Nepal
        </h1>
        <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
          For attar houses, independent perfumers and authorised distributors.
        </p>
        <ol className="mt-10 space-y-6">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-gold-soft font-display text-lg font-semibold text-gold-strong">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <Card padding="lg" tone="champagne" className="h-fit">
        <h2 className="font-display text-3xl font-semibold">Open your store</h2>
        <p className="mt-2 text-muted">
          Apply in four short steps: your store, contact details, business and payout details, then a quick review.
          You&apos;ll need to be signed in.
        </p>
        <ul className="mt-6 space-y-2 text-sm">
          <li>Clear commission, snapshotted on every order</li>
          <li>Payouts with a per-order breakdown</li>
          <li>Sales, stock and reviews in one seller centre</li>
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/vendor/apply" size="lg">
            Start your application
          </ButtonLink>
          <ButtonLink href="/vendor/status" size="lg" variant="outline">
            Check my application
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
