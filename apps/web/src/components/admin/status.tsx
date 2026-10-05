import type { ComponentType, SVGProps } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  AlertIcon,
  BanIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  PackageIcon,
  ReturnIcon,
  TruckIcon,
} from "@/components/ui/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Spec = { label: string; tone: BadgeTone; icon: Icon };

// Each status carries words and its own icon; colour is only a third cue.
const MAPS = {
  return: {
    REQUESTED: { label: "Requested", tone: "gold", icon: ClockIcon },
    APPROVED: { label: "Approved", tone: "accent", icon: CheckIcon },
    REJECTED: { label: "Rejected", tone: "danger", icon: BanIcon },
    RECEIVED: { label: "Received", tone: "accent", icon: PackageIcon },
    REFUNDED: { label: "Refunded", tone: "success", icon: ReturnIcon },
  },
  ticket: {
    OPEN: { label: "Open", tone: "gold", icon: ClockIcon },
    AWAITING_CUSTOMER: { label: "Awaiting customer", tone: "accent", icon: InfoIcon },
    RESOLVED: { label: "Resolved", tone: "success", icon: CheckIcon },
    CLOSED: { label: "Closed", tone: "neutral", icon: CheckIcon },
  },
  priority: {
    LOW: { label: "Low", tone: "neutral", icon: InfoIcon },
    NORMAL: { label: "Normal", tone: "neutral", icon: InfoIcon },
    HIGH: { label: "High", tone: "danger", icon: AlertIcon },
  },
  vendor: {
    PENDING: { label: "Awaiting review", tone: "gold", icon: ClockIcon },
    APPROVED: { label: "Approved", tone: "success", icon: CheckIcon },
    REJECTED: { label: "Rejected", tone: "danger", icon: BanIcon },
    SUSPENDED: { label: "Suspended", tone: "warning", icon: AlertIcon },
  },
  order: {
    CART: { label: "Cart", tone: "neutral", icon: InfoIcon },
    PENDING_PAYMENT: { label: "Awaiting payment", tone: "gold", icon: ClockIcon },
    PAID: { label: "Paid", tone: "accent", icon: CheckIcon },
    PROCESSING: { label: "Processing", tone: "accent", icon: PackageIcon },
    SHIPPED: { label: "Shipped", tone: "accent", icon: TruckIcon },
    DELIVERED: { label: "Delivered", tone: "success", icon: CheckIcon },
    CANCELLED: { label: "Cancelled", tone: "danger", icon: BanIcon },
    REFUNDED: { label: "Refunded", tone: "neutral", icon: ReturnIcon },
    PAYMENT_FAILED: { label: "Payment failed", tone: "danger", icon: AlertIcon },
  },
  payout: {
    PENDING: { label: "To pay", tone: "gold", icon: ClockIcon },
    PAID: { label: "Paid", tone: "success", icon: CheckIcon },
    CANCELLED: { label: "Cancelled", tone: "neutral", icon: BanIcon },
  },
  health: {
    ok: { label: "Healthy", tone: "success", icon: CheckIcon },
    degraded: { label: "Degraded", tone: "warning", icon: AlertIcon },
    down: { label: "Down", tone: "danger", icon: BanIcon },
    unknown: { label: "Not monitored", tone: "neutral", icon: InfoIcon },
  },
} satisfies Record<string, Record<string, Spec>>;

export type StatusKind = keyof typeof MAPS;

export function statusLabel(kind: StatusKind, status: string): string {
  return (MAPS[kind] as Record<string, Spec>)[status]?.label ?? status.replaceAll("_", " ").toLowerCase();
}

export function StatusBadge({ kind, status }: { kind: StatusKind; status: string }) {
  const spec: Spec = (MAPS[kind] as Record<string, Spec>)[status] ?? {
    label: statusLabel(kind, status),
    tone: "neutral",
    icon: InfoIcon,
  };
  const I = spec.icon;
  return (
    <Badge tone={spec.tone}>
      <I width={12} height={12} aria-hidden />
      {spec.label}
    </Badge>
  );
}
