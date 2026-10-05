import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { WishlistSync } from "@/components/wishlist-sync";
import { CartSync } from "@/components/cart-sync";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { SessionTimeout } from "@/components/auth/session-timeout";
import { Toaster } from "@/lib/toast";
import { ConfirmHost } from "@/components/ui/confirm";
import { PromptHost } from "@/components/ui/prompt";
import { getCategoryTree, type CategoryTree } from "@/lib/api";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Display: Cormorant Garamond (static family, so weights are listed). Every serif
// heading uses 600, so only 600 (+ italic) ships: 2 font files instead of 6.
// Body/UI: Inter.
const display = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["600"],
  style: ["normal", "italic"],
  display: "swap",
});
const sans = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  // Absolute URLs for canonical links and OG/Twitter images.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
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
      className={`${display.variable} ${sans.variable} h-full antialiased`}
      // The theme script below adds `dark` before hydration, and browser extensions
      // inject attributes too; this suppresses only <html>'s own attribute mismatch.
      suppressHydrationWarning
    >
      <head>
        {/* Runs during parsing, before first paint: no flash of the wrong theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <AuthProvider>
          <StoreProvider>
            <WishlistSync />
            <CartSync />
            <SessionTimeout />
            <Header categories={categories} />
            <main className="flex-1">{children}</main>
            <Footer categories={categories} />
            <CartDrawer />
            <Toaster />
            <ConfirmHost />
            <PromptHost />
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
