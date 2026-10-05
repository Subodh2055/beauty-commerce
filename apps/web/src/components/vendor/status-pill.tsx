import type { ComponentType, SVGProps } from "react";
import type { ProductStatus, VendorOrderStatus } from "@/lib/vendor";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { AlertIcon, CheckIcon, ClockIcon, EditIcon, PackageIcon, TruckIcon } from "@/components/ui/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Every status has its own icon and words; colour is a third, redundant cue.
const PRODUCT: Record<ProductStatus, { label: string; tone: BadgeTone; icon: Icon }> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: EditIcon },
  PENDING: { label: "In review", tone: "gold", icon: ClockIcon },
  PUBLISHED: { label: "Live", tone: "success", icon: CheckIcon },
  REJECTED: { label: "Changes needed", tone: "danger", icon: AlertIcon },
  ARCHIVED: { label: "Archived", tone: "neutral", icon: PackageIcon },
};

const ORDER: Record<VendorOrderStatus, { label: string; tone: BadgeTone; icon: Icon }> = {
  PENDING: { label: "Awaiting payment", tone: "gold", icon: ClockIcon },
  PROCESSING: { label: "New", tone: "accent", icon: PackageIcon },
  PACKED: { label: "Packed", tone: "gold", icon: PackageIcon },
  SHIPPED: { label: "Shipped", tone: "accent", icon: TruckIcon },
  DELIVERED: { label: "Delivered", tone: "success", icon: CheckIcon },
  CANCELLED: { label: "Cancelled", tone: "danger", icon: AlertIcon },
  REFUNDED: { label: "Refunded", tone: "neutral", icon: AlertIcon },
};

export const orderStatusLabel = (s: VendorOrderStatus) => ORDER[s]?.label ?? s;
export const productStatusLabel = (s: ProductStatus) => PRODUCT[s]?.label ?? s;

function Pill({ label, tone, icon: I }: { label: string; tone: BadgeTone; icon: Icon }) {
  return (
    <Badge tone={tone}>
      <I width={12} height={12} aria-hidden />
      {label}
    </Badge>
  );
}

export function ProductStatusPill({ status }: { status: ProductStatus }) {
  return <Pill {...(PRODUCT[status] ?? { label: status, tone: "neutral", icon: EditIcon })} />;
}

export function OrderStatusPill({ status }: { status: VendorOrderStatus }) {
  return <Pill {...(ORDER[status] ?? { label: status, tone: "neutral", icon: PackageIcon })} />;
}
