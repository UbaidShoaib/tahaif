import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Banknote, Lock, MapPinned } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { NAV_LINKS } from "@/components/layout/nav-links";
import { SupportWhatsApp } from "@/components/support/SupportWhatsApp";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { brand } from "@/lib/brand";

const linkClass = "inline-flex min-h-9 items-center hover:text-foreground transition-colors";

export async function Footer() {
  const t = await getTranslations();

  const columns: { heading: string; links: { href: string; label: string }[] }[] = [
    { heading: t("footer.shop"), links: NAV_LINKS.map((l) => ({ href: l.href, label: t(`nav.${l.key}`) })) },
    {
      heading: t("footer.account"),
      links: [
        { href: "/login", label: t("footer.login") },
        { href: "/register", label: t("footer.register") },
        { href: "/account/orders", label: t("footer.myOrders") },
        { href: "/account/addresses", label: t("footer.addresses") },
      ],
    },
    {
      heading: t("footer.help"),
      links: [
        { href: "/faq", label: t("footer.faq") },
        { href: "/contact", label: t("footer.contact") },
        { href: "/terms", label: t("footer.terms") },
        { href: "/privacy", label: t("footer.privacy") },
        { href: "/refund", label: t("footer.refund") },
      ],
    },
  ];

  return (
    <footer className="border-t bg-muted/40">
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold text-link">
              <BrandLogo markClassName="h-5 w-5" />
            </Link>
            <p className="mt-2 text-sm text-muted-foreground">{t("footer.tagline")}</p>
            <div className="mt-4">
              <SupportWhatsApp />
            </div>
          </div>

          {columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">{col.heading}</h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={linkClass}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-muted-foreground">{t("footer.rights", { year: new Date().getFullYear(), brand: brand.name })}</p>
          {/* Only claims we can back up today; no refund promise until the Refund
              Policy is published (docs/questions.md Q17). */}
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <Lock aria-hidden className="h-4 w-4" /> {t("footer.secureCheckout")}
            </li>
            <li className="flex items-center gap-1.5">
              <Banknote aria-hidden className="h-4 w-4" /> {t("footer.cod")}
            </li>
            <li className="flex items-center gap-1.5">
              <MapPinned aria-hidden className="h-4 w-4" /> {t("footer.tracking")}
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
