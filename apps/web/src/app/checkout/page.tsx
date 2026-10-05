import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  // The flow reads ?step= (useSearchParams), so it needs a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="container-x py-10">
          <Skeleton className="mb-8 h-10 w-full max-w-xl" />
          <Skeleton className="h-80" />
        </div>
      }
    >
      <CheckoutFlow />
    </Suspense>
  );
}
