import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationStatus } from "@/components/vendor/application-status";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Seller application",
  robots: { index: false, follow: false },
};

export default function VendorStatusPage() {
  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-2xl">
        <Suspense fallback={<Skeleton className="h-96 rounded-panel" />}>
          <ApplicationStatus />
        </Suspense>
      </div>
    </div>
  );
}
