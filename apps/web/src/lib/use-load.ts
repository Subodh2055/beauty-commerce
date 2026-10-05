"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Result<T> = { key: string; data: T; error: null } | { key: string; data: null; error: Error };

/**
 * Fetch-on-key for client pages. The result is stored with the key it was
 * fetched for, so when the key changes `data` is null (loading) until the new
 * result lands — derived during render, with no setState-in-effect reset.
 * `reload()` refetches the current key, keeping the old data on screen;
 * `update()` patches it in place (optimistic edits). A failed load surfaces as
 * `error` (or `fallback` as data, when one is given) so pages can offer a retry.
 */
export function useLoad<T>(key: string, fetcher: () => Promise<T>, fallback?: T) {
  const [state, setState] = useState<Result<T> | null>(null);
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
      .then((data) => active && setState({ key, data, error: null }))
      .catch((err: unknown) => {
        if (!active) return;
        if (fallbackRef.current !== undefined) setState({ key, data: fallbackRef.current, error: null });
        else setState({ key, data: null, error: err instanceof Error ? err : new Error("Request failed") });
      });
    return () => {
      active = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const update = useCallback(
    (fn: (data: T) => T) =>
      setState((s) => (s && s.error === null ? { ...s, data: fn(s.data) } : s)),
    [],
  );
  const current = state?.key === key ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? null, reload, update };
}
