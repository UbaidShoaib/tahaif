import Link from "next/link";
import {
  Banknote,
  Cake,
  CalendarCheck,
  CircleCheck,
  Candy,
  Flower2,
  Gift,
  Leaf,
  MapPinned,
  MessageSquareHeart,
  Package,
  SprayCan,
  type LucideIcon,
} from "lucide-react";
import { catalogApi } from "@/lib/catalog";
import { ProductCard } from "@/components/catalog/ProductCard";
import { HeroFinder } from "@/components/home/HeroFinder";
import { SameDayRail } from "@/components/home/SameDayRail";
import { brand } from "@/lib/brand";
import { onTimePercent } from "@/lib/stats";

const CATEGORIES: { name: string; slug: string; icon: LucideIcon; desc: string }[] = [
  { name: "Cakes", slug: "cakes", icon: Cake, desc: "Birthday, wedding & custom cakes" },
  { name: "Flowers", slug: "flowers", icon: Flower2, desc: "Fresh bouquets & arrangements" },
  { name: "Chocolates", slug: "chocolates", icon: Package, desc: "Boxes and hampers" },
  { name: "Perfumes", slug: "perfumes", icon: SprayCan, desc: "Local and international fragrances" },
  { name: "Mithai", slug: "mithai", icon: Candy, desc: "Traditional Pakistani sweets" },
  { name: "Combo Gifts", slug: "combo-gifts", icon: Gift, desc: "Curated gift sets & hampers" },
];

const OCCASIONS = [
  { name: "Birthday", slug: "birthday", emoji: "🎂" },
  { name: "Eid ul Fitr", slug: "eid-ul-fitr", emoji: "🌙" },
  { name: "Anniversary", slug: "anniversary", emoji: "💑" },
  { name: "Mother's Day", slug: "mothers-day", emoji: "💐" },
  { name: "Wedding", slug: "wedding", emoji: "💍" },
  { name: "Aqiqa", slug: "aqiqa", emoji: "🐑" },
];

const STEPS = [
  { title: "Choose a gift and city", desc: "Prices, delivery fee and the earliest day update for the city you're sending to." },
  { title: "Add your card message", desc: "Write a personal note; it's printed on a card and delivered with the gift." },
  { title: "We deliver, you track", desc: "Pay by cash on delivery or bank transfer, then follow the delivery online." },
];

// Only promises the service already makes (see docs/questions.md Q17 before adding refund claims).
const TRUST: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Leaf, title: "Freshness promise", desc: "On every cake and bouquet" },
  { icon: MessageSquareHeart, title: "Personal card message", desc: "Printed and delivered with your gift" },
  { icon: Banknote, title: "Cash on delivery", desc: "Or pay by bank transfer" },
  { icon: MapPinned, title: "Track every order", desc: "Follow it from bakery to doorstep" },
];

export default async function HomePage() {
  const [{ items: featuredProducts }, onTime] = await Promise.all([
    catalogApi.getProducts({ page_size: 8 }).catch(() => ({ items: [], total: 0, page: 1, page_size: 8 })),
    onTimePercent(),
  ]);
  // A measured rate, shown only once there's enough delivery history.
  const trust =
    onTime === null
      ? TRUST
      : [{ icon: CalendarCheck, title: `${onTime}% on the chosen day`, desc: "Measured over the last 90 days" }, ...TRUST];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-700 to-primary-900 px-4 py-16 text-white md:py-24">
        {/* Decorative zari ribbon */}
        <svg
          aria-hidden
          className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 text-gold opacity-20"
          viewBox="0 0 200 200"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="100" cy="100" r="90" />
          <circle cx="100" cy="100" r="70" strokeDasharray="4 6" />
          <path d="M100 10v180M10 100h180" />
        </svg>
        <div className="container relative mx-auto max-w-3xl space-y-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium">
            <Gift aria-hidden className="h-4 w-4 text-gold" />
            Gifts delivered across Pakistan
          </p>
          <h1 className="text-display text-white">Send love home, delivered fresh.</h1>
          <p className="mx-auto max-w-xl text-lg text-primary-100">
            Cakes, flowers, mithai and more for the people you miss — with your own card message, delivered in
            Karachi, Lahore, Islamabad and beyond.
          </p>
          <div className="mx-auto max-w-xl">
            <HeroFinder />
          </div>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-primary-100">
            {["Cash on delivery", "No account needed", "Card message included"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CircleCheck aria-hidden className="h-4 w-4 text-gold" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Occasions */}
      <section aria-labelledby="occasions-heading" className="bg-background-alt px-4 py-10">
        <div className="container mx-auto">
          <h2 id="occasions-heading" className="mb-5 text-center text-h2">
            Shop by occasion
          </h2>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
            {OCCASIONS.map((o) => (
              <li key={o.slug} className="shrink-0">
                <Link
                  href={`/occasion/${o.slug}`}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-sm font-medium transition-colors hover:border-primary-700 hover:text-link"
                >
                  <span aria-hidden>{o.emoji}</span>
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SameDayRail />

      {/* Categories */}
      <section aria-labelledby="categories-heading" className="px-4 py-12">
        <div className="container mx-auto">
          <h2 id="categories-heading" className="mb-6 text-h2">
            Shop by category
          </h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {CATEGORIES.map(({ name, slug, icon: Icon, desc }) => (
              <li key={slug}>
                <Link
                  href={`/c/${slug}`}
                  className="group flex h-full flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-all hover:border-primary-300 hover:shadow-md"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft transition-colors group-hover:bg-gold-soft">
                    <Icon aria-hidden className="h-7 w-7 text-primary-soft-foreground group-hover:text-gold-ink" />
                  </span>
                  <span className="font-semibold">{name}</span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Featured */}
      {featuredProducts.length > 0 && (
        <section aria-labelledby="featured-heading" className="bg-background-alt px-4 py-12">
          <div className="container mx-auto">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 id="featured-heading" className="text-h2">
                Featured gifts
              </h2>
              <Link href="/search" className="text-sm font-medium text-link hover:underline">
                View all <span aria-hidden>→</span>
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {featuredProducts.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* How it works */}
      <section aria-labelledby="how-heading" className="px-4 py-12">
        <div className="container mx-auto">
          <h2 id="how-heading" className="mb-8 text-center text-h2">
            How it works
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 rounded-xl border bg-card p-5">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-700 font-display text-lg font-semibold text-white"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-sans font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section aria-label={`Why ${brand.name}`} className="border-t bg-background-alt px-4 py-10">
        <ul
          className={`container mx-auto grid grid-cols-2 gap-6 ${trust.length > 4 ? "md:grid-cols-5" : "md:grid-cols-4"}`}
        >
          {trust.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="rounded-lg bg-success-soft p-2.5">
                <Icon aria-hidden className="h-5 w-5 text-success-foreground" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-muted-foreground">{desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
