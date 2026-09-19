"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-x flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Something went wrong</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold">We hit a snag loading this page.</h1>
      <p className="mt-2 max-w-md text-muted">
        The catalogue service may be unavailable. Try again in a moment.
      </p>
      {error.digest && <p className="mt-1 font-mono text-xs text-muted">ref {error.digest}</p>}
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="outline">Home</ButtonLink>
      </div>
    </div>
  );
}
