import type { Metadata } from "next";
import { Suspense } from "react";
import { getFragranceNotes } from "@/lib/api";
import { ScentQuiz } from "@/components/recommendations/scent-quiz";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Find your scent",
  description: "Four quick questions — mood, occasion, season and the notes you love — and we match you to fragrances.",
};

export default async function FindYourScentPage() {
  const notes = await getFragranceNotes().catch(() => []);
  return (
    <div className="container-x py-12 sm:py-16">
      <header className="mx-auto mb-10 max-w-3xl text-center">
        <p className="eyebrow">Scent finder</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-display sm:text-5xl">Find your scent</h1>
        <p className="mt-3 text-muted">
          Four quick questions. We match your answers against every fragrance&apos;s notes and character, and tell you
          why each one fits.
        </p>
      </header>
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-3xl" />}>
        <ScentQuiz notes={[...notes].sort((a, b) => a.name.localeCompare(b.name))} />
      </Suspense>
    </div>
  );
}
