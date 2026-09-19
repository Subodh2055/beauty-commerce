import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-x flex min-h-[50vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">404</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold">We couldn’t find that.</h1>
      <p className="mt-2 max-w-md text-muted">
        The product or page may have been moved or is no longer available.
      </p>
      <div className="mt-6 flex gap-3">
        <ButtonLink href="/products">Browse products</ButtonLink>
        <ButtonLink href="/" variant="outline">Home</ButtonLink>
      </div>
    </div>
  );
}
