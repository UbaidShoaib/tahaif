import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Tahaif — Send Gifts Across Pakistan", template: "%s | Tahaif" },
  description:
    "Send cakes, flowers, perfumes and more to your loved ones across Pakistan. Fast delivery, quality guaranteed.",
  keywords: ["gifts pakistan", "send gifts", "cakes", "flowers", "tahaif", "تحائف"],
  openGraph: {
    type: "website",
    locale: "en_PK",
    siteName: "Tahaif",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Skip-to-content link — visible on focus for keyboard/screen-reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[#16a34a] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>

        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main id="main-content" className="flex-1" tabIndex={-1}>
              {children}
            </main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
