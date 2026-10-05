import Link from "next/link";
import { GridIcon, ListIcon } from "@/components/ui/icons";

export type ListingView = "grid" | "list";

/** Grid / list switch. Plain links (the view is a URL param) so it works without JS
 * and the server renders the chosen layout directly. */
export function ViewToggle({
  pathname,
  params,
  view,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  view: ListingView;
}) {
  const href = (v: ListingView) => {
    const sp = new URLSearchParams();
    for (const [k, val] of Object.entries(params)) if (val && k !== "view") sp.set(k, val);
    if (v === "list") sp.set("view", "list");
    const s = sp.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const item = (v: ListingView, label: string, Icon: typeof GridIcon) => {
    const on = v === view;
    return (
      <Link
        href={href(v)}
        scroll={false}
        aria-current={on ? "true" : undefined}
        aria-label={label}
        title={label}
        className={`focus-ring inline-flex h-9 w-9 items-center justify-center rounded-pill transition-colors duration-(--duration-fast) ${
          on ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        <Icon width={16} height={16} aria-hidden />
      </Link>
    );
  };
  return (
    <nav aria-label="Layout" className="inline-flex items-center gap-0.5 rounded-pill border border-border-strong p-0.5">
      {item("grid", "Grid view", GridIcon)}
      {item("list", "List view", ListIcon)}
    </nav>
  );
}
