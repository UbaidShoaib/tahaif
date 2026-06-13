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
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
