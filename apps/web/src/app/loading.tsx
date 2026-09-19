import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-x py-10">
      <Skeleton className="mb-3 h-3 w-40" />
      <Skeleton className="mb-8 h-9 w-72" />
      <ProductGridSkeleton />
    </div>
  );
}
