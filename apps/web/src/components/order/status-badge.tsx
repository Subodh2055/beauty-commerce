import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "accent" | "gold" | "success" | "danger";

const STATUS_TONE: Record<string, Tone> = {
  PENDING_PAYMENT: "gold",
  PROCESSING: "accent",
  PAID: "accent",
  SHIPPED: "accent",
  DELIVERED: "success",
  CANCELLED: "danger",
  REFUNDED: "neutral",
  PAYMENT_FAILED: "danger",
};

const PAYMENT_TONE: Record<string, Tone> = {
  PENDING: "gold",
  PAID: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export function label(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label(status)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: string }) {
  return <Badge tone={PAYMENT_TONE[status] ?? "neutral"}>{label(status)}</Badge>;
}
