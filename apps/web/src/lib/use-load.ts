"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch-on-key for client pages. The result is stored with the key it was
 * fetched for, so when the key changes `data` is null (loading) until the new
 * result lands — derived during render, with no setState-in-effect reset.
 * `reload()` refetches the current key, keeping the old data on screen;
 * `update()` patches it in place (optimistic edits).
 */
export function useLoad<T>(key: string, fetcher: () => Promise<T>, fallback?: T) {
  const [state, setState] = useState<{ key: string; data: T } | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetchRef = useRef(fetcher);
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    fetchRef.current = fetcher;
    fallbackRef.current = fallback;
  });

  useEffect(() => {
    let active = true;
    fetchRef
      .current()
      .then((data) => active && setState({ key, data }))
      .catch(() => {
        if (active && fallbackRef.current !== undefined) setState({ key, data: fallbackRef.current });
      });
    return () => {
      active = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const update = useCallback((fn: (data: T) => T) => setState((s) => (s ? { ...s, data: fn(s.data) } : s)), []);
  return { data: state?.key === key ? state.data : null, reload, update };
}
