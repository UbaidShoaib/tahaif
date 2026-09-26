import type { Metadata } from "next";
import { Fraunces, Inter, Noto_Naskh_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { directionOf, isLocale, DEFAULT_LOCALE } from "@/i18n/config";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "@/styles/globals.css";

// Exposed as CSS variables so Tailwind's font-sans / font-display can use them.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});
// Urdu script. Declared for every page but only downloaded when Urdu text renders.
const naskh = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-naskh",
  display: "swap",
});

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${naskh.variable}`}
    >
      <body>
        {/* Skip-to-content link — visible on focus for keyboard/screen-reader users */}
        <a
          href="#main-content"
          className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>

        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main id="main-content" className="flex-1" tabIndex={-1}>
                {children}
              </main>
              <Footer />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
