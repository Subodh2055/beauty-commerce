import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const d = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const SearchIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const BagIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M6 8h12l-1 12H7L6 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);

export const HeartIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...d(p)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
  </svg>
);

export const UserIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
);

export const MenuIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const ChevronIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const StarIcon = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...d(p)} fill={filled ? "currentColor" : "none"}>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" />
  </svg>
);

export const MinusIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const PlusIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const TrashIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const FilterIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);

export const SparkleIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5" />
  </svg>
);

export const ChevronDownIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const MailIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

export const InstagramIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M17.5 6.5h.01" />
  </svg>
);

export const FacebookIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M14 8h2V5h-2a3 3 0 0 0-3 3v2H9v3h2v6h3v-6h2l1-3h-3V8a1 1 0 0 1 1-1Z" />
  </svg>
);

export const TiktokIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M15 4c.5 2 2 3.5 4 3.8V11c-1.6 0-3-.5-4-1.3V15a5 5 0 1 1-5-5v3a2 2 0 1 0 2 2V4h3Z" />
  </svg>
);

export const CheckIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const AlertIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </svg>
);

export const InfoIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </svg>
);

/** Empty-state default: a perfume bottle. */
export const BottleIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M10 3h4v3h-4zM9 6h6l1 3H8l1-3Z" />
    <rect x="6" y="9" width="12" height="12" rx="3" />
    <path d="M9.5 14h5" />
  </svg>
);
export const GridIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

export const ListIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="4" y="5" width="5" height="5" rx="1" />
    <rect x="4" y="14" width="5" height="5" rx="1" />
    <path d="M12 7.5h8M12 16.5h8" />
  </svg>
);

export const ZoomIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
  </svg>
);

export const TruckIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" />
    <circle cx="7" cy="18" r="1.75" />
    <circle cx="17.5" cy="18" r="1.75" />
  </svg>
);

export const PackageIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </svg>
);

export const CardIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18M7 15h3" />
  </svg>
);

export const PinIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

export const EditIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
);

export const DashboardIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="4" y="4" width="7" height="9" rx="1.5" />
    <rect x="13" y="4" width="7" height="5" rx="1.5" />
    <rect x="13" y="11" width="7" height="9" rx="1.5" />
    <rect x="4" y="15" width="7" height="5" rx="1.5" />
  </svg>
);

export const LayersIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="m12 4 8 4-8 4-8-4 8-4Z" />
    <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
  </svg>
);

export const WalletIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M4 7a2 2 0 0 1 2-2h11v4" />
    <rect x="4" y="7" width="16" height="12" rx="2" />
    <path d="M16 13h2" />
  </svg>
);

export const SettingsIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3" />
  </svg>
);

export const UploadIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const GripIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="9" cy="6" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="18" r="1" />
  </svg>
);

export const ArrowUpIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const ArrowDownIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);

export const ExternalIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M14 5h5v5M19 5l-8 8" />
    <path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
  </svg>
);

export const ClockIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.5 2" />
  </svg>
);

export const ShieldIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const ChartIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 16v-5M12 16V8M16 16v-3" />
  </svg>
);

export const ReturnIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

export const UsersIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
  </svg>
);

export const TagIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M3 12V4h8l9 9-8 8-9-9Z" />
    <circle cx="7.5" cy="8.5" r="1.25" />
  </svg>
);

export const ImageIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="m21 16-5-5-8 9" />
  </svg>
);

export const ChatIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
    <path d="M8 10h8M8 13h5" />
  </svg>
);

export const StoreIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M4 9 5.5 4h13L20 9" />
    <path d="M4 9a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0A2.67 2.67 0 0 0 20 9" />
    <path d="M5 11v9h14v-9M10 20v-5h4v5" />
  </svg>
);

export const ActivityIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </svg>
);

export const KeyIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M16 7l3 3M14 9l2 2" />
  </svg>
);

export const PercentIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M19 5 5 19" />
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="17" r="2.5" />
  </svg>
);

export const HistoryIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </svg>
);

export const RefreshIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M20 11a8 8 0 0 0-14.9-3.5L4 9" />
    <path d="M4 4v5h5M4 13a8 8 0 0 0 14.9 3.5L20 15" />
    <path d="M20 20v-5h-5" />
  </svg>
);

export const BellIcon = (p: P) => (
  <svg {...d(p)}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);

export const CalendarIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const LockIcon = (p: P) => (
  <svg {...d(p)}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const BanIcon = (p: P) => (
  <svg {...d(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.7 5.7 12.6 12.6" />
  </svg>
);
