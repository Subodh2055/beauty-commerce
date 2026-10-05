"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isSuperAdmin, useAuth } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  ActivityIcon,
  DashboardIcon,
  HistoryIcon,
  KeyIcon,
  PercentIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";

const NAV = [
  { href: "/super-admin", label: "Overview", icon: DashboardIcon, group: "Platform" },
  { href: "/super-admin/admins", label: "Admins", icon: UsersIcon, group: "Access" },
  { href: "/super-admin/roles", label: "Roles & permissions", icon: KeyIcon, group: "Access" },
  { href: "/super-admin/commission", label: "Commission", icon: PercentIcon, group: "Money" },
  { href: "/super-admin/settings", label: "Settings", icon: SettingsIcon, group: "Money" },
  { href: "/super-admin/audit", label: "Audit log", icon: HistoryIcon, group: "Oversight" },
  { href: "/super-admin/system", label: "System health", icon: ActivityIcon, group: "Oversight" },
];

/**
 * The super-admin area. Visually set apart from /admin on purpose: a violet
 * "platform" banner, shield marks and a violet active state, so nobody changes
 * a platform-wide setting thinking they're in the everyday admin. Access is
 * enforced by the proxy (SUPER_ADMIN role) and by the API on every call.
 */
export function SuperAdminShell({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const allowed = isSuperAdmin(user);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login?next=/super-admin");
    else if (!allowed) router.replace("/admin");
  }, [ready, user, allowed, router]);

  return (
    <DashboardShell
      variant="platform"
      title={
        <span className="inline-flex items-center gap-2">
          <ShieldIcon width={24} height={24} className="text-platform" aria-hidden />
          Super admin
        </span>
      }
      subtitle={user?.email}
      aside={
        <Link href="/admin" className="focus-ring rounded-sm text-sm text-muted hover:text-accent">
          Admin
        </Link>
      }
      banner={
        <div
          role="note"
          className="mb-6 flex items-start gap-3 rounded-card border border-platform/40 bg-platform-soft px-4 py-3 text-sm"
        >
          <ShieldIcon width={18} height={18} className="mt-0.5 shrink-0 text-platform" aria-hidden />
          <p>
            <span className="font-semibold text-platform">Platform controls.</span>{" "}
            <span className="text-muted">
              Changes here apply to every shopper, vendor and admin, and each one is written to the audit log.
            </span>
          </p>
        </div>
      }
      nav={NAV}
      ready={ready && allowed}
    >
      {children}
    </DashboardShell>
  );
}
