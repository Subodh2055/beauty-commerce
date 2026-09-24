import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { WishlistSync } from "@/components/wishlist-sync";
import { CartSync } from "@/components/cart-sync";
import { SessionTimeout } from "@/components/auth/session-timeout";
import { Toaster } from "@/lib/toast";
import { getCategoryTree, type CategoryTree } from "@/lib/api";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Beauty Commerce", template: "%s · Beauty Commerce" },
  description:
    "Perfumes, cosmetics and skincare — curated with AI-assisted shopping.",
};

async function safeCategories(): Promise<CategoryTree[]> {
  try {
    return await getCategoryTree();
  } catch {
    // API down: render the shell without category nav rather than crashing.
    return [];
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const categories = await safeCategories();

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
      // Browser extensions (password managers, crxlauncher, etc.) inject attributes
      // onto <html> before hydration; this suppresses only that element's attribute
      // mismatch warning, not real ones deeper in the tree.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <AuthProvider>
          <StoreProvider>
            <WishlistSync />
            <CartSync />
            <SessionTimeout />
            <Header categories={categories} />
            <main className="flex-1">{children}</main>
            <Footer categories={categories} />
            <Toaster />
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
