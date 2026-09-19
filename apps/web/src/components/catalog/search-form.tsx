"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SearchIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

export function SearchForm({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();

  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <form onSubmit={submit} role="search" className="mb-8 flex max-w-xl gap-2">
      <label className="relative flex-1">
        <span className="sr-only">Search</span>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={!initial}
          placeholder="Search products, brands, notes…"
          className="focus-ring h-11 w-full rounded-full border border-border bg-surface pl-10 pr-4"
        />
      </label>
      <Button type="submit">Search</Button>
    </form>
  );
}
