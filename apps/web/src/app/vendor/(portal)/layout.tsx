import type { Metadata } from "next";
import { VendorShell } from "@/components/vendor/vendor-shell";

// Route group: every page in (portal) shares the seller-centre frame. The proxy
// (src/proxy.ts) has already required the VENDOR role before we get here.
export const metadata: Metadata = {
  title: { default: "Seller centre", template: "%s · Seller centre" },
  robots: { index: false, follow: false },
};

export default function VendorPortalLayout({ children }: { children: React.ReactNode }) {
  return <VendorShell>{children}</VendorShell>;
}
