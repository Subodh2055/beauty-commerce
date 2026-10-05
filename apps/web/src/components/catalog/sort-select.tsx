"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SortOption } from "@/lib/api";
import { Select } from "@/components/ui/field";

const OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "featured", label: "Featured" },
  { value: "bestselling", label: "Bestselling" },
  { value: "rating", label: "Top rated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const value = (sp.get("sort") as SortOption) || "newest";

  return (
    <Select
      label="Sort"
      controlSize="sm"
      className="flex items-center gap-2 space-y-0 text-sm [&>label]:font-normal [&>label]:text-muted"
      selectClassName="rounded-pill"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        next.set("sort", e.target.value);
        next.delete("page");
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      }}
      options={OPTIONS}
    />
  );
}
