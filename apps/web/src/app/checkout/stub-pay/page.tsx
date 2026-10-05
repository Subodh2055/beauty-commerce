import type { Metadata } from "next";
import { Suspense } from "react";
import { StubPay } from "@/components/checkout/stub-pay";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Complete payment",
  robots: { index: false, follow: false },
};

export default function StubPayPage() {
  return (
    <Suspense
      fallback={
        <div className="container-x py-16">
          <Skeleton className="mx-auto h-72 max-w-md" />
        </div>
      }
    >
      <StubPay />
    </Suspense>
  );
}
