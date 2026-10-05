"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * List filters kept in the URL (shareable, back-button safe). Changing any
 * filter but `page` resets to page 1. Pages using this must render inside a
 * <Suspense> boundary (useSearchParams).
 */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const get = useCallback((key: string) => sp.get(key) ?? "", [sp]);
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );
  const page = Math.max(1, Number(sp.get("page")) || 1);
  return { get, set, page };
}

/** A search box that writes `q` to the URL 300ms after typing stops. */
export function useDebouncedQuery(q: string, set: (patch: Record<string, string | null>) => void) {
  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (search === q) return;
    const t = window.setTimeout(() => set({ q: search.trim() || null }), 300);
    return () => window.clearTimeout(t);
  }, [search, q, set]);
  return [search, setSearch] as const;
}
