import type { Metadata } from "next";
import { SuperAdminShell } from "@/components/admin/super-admin-shell";

export const metadata: Metadata = { title: "Super admin", robots: { index: false } };

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
