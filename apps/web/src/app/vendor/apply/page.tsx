import type { Metadata } from "next";
import { ApplicationWizard } from "@/components/vendor/application-wizard";

export const metadata: Metadata = {
  title: "Apply to sell",
  robots: { index: false, follow: false },
};

export default function VendorApplyPage() {
  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow">Seller centre</p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Apply to sell</h1>
        <p className="mt-2 text-muted">
          Four short steps. We review every store by hand, usually within two working days.
        </p>
        <div className="mt-8">
          <ApplicationWizard />
        </div>
      </div>
    </div>
  );
}
