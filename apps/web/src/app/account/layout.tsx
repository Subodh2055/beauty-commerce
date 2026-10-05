import type { Metadata } from "next";

// Personal pages: titled for the tab, kept out of search results.
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
