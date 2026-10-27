import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import {
  Banknote,
  Cake,
  CalendarCheck,
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
import { catalogApi, type Occasion, type Product } from "@/lib/catalog";
import { bucketsApi, type BuilderSummary } from "@/lib/buckets";
import { categoryPhotos } from "@/lib/home";
import { isOptimizable } from "@/lib/image-hosts";
import { ProductCard } from "@/components/catalog/ProductCard";
import { HeroFinder } from "@/components/home/HeroFinder";
import { SameDayRail } from "@/components/home/SameDayRail";
import { brand } from "@/lib/brand";
import { onTimePercent } from "@/lib/stats";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = canonical("/");

const CATEGORIES: { name: string; slug: string; icon: LucideIcon; desc: string }[] = [
  { name: "Cakes", slug: "cakes", icon: Cake, desc: "Birthday, wedding & custom cakes" },
  { name: "Flowers", slug: "flowers", icon: Flower2, desc: "Fresh bouquets & arrangements" },
  { name: "Chocolates", slug: "chocolates", icon: Package, desc: "Boxes and hampers" },
  { name: "Perfumes", slug: "perfumes", icon: SprayCan, desc: "Local and international fragrances" },
  { name: "Mithai", slug: "mithai", icon: Candy, desc: "Traditional Pakistani sweets" },
  { name: "Combo Gifts", slug: "combo-gifts", icon: Gift, desc: "Curated gift sets & hampers" },
];

/** Used only when the occasions API is unreachable, so the page still offers them. */
const FALLBACK_OCCASIONS: { name: string; slug: string; banner_url: string | null }[] = [
  { name: "Birthday", slug: "birthday", banner_url: null },
  { name: "Eid ul Fitr", slug: "eid-ul-fitr", banner_url: null },
  { name: "Anniversary", slug: "anniversary", banner_url: null },
  { name: "Mother's Day", slug: "mothers-day", banner_url: null },
  { name: "Wedding", slug: "wedding", banner_url: null },
  { name: "Aqiqa", slug: "aqiqa", banner_url: null },
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

/** A product photo, rounded and cropped to fill its box. */
function Photo({ src, alt, sizes, priority }: { src: string; alt: string; sizes: string; priority?: boolean }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className="object-cover"
      unoptimized={!isOptimizable(src)}
    />
  );
}

/** A thin gold rule, the page's zari motif: under headings and between bands. */
function Zari({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block h-px w-12 bg-gold ${className}`} />;
}

export default async function HomePage() {
  const [{ items: products }, categories, onTime, builders, allOccasions] = await Promise.all([
    catalogApi.getProducts({ page_size: 48 }).catch(() => ({ items: [] as Product[], total: 0, page: 1, page_size: 48 })),
    catalogApi.getCategories().catch(() => []),
    onTimePercent(),
    bucketsApi.list().catch(() => [] as BuilderSummary[]),
    catalogApi.getOccasions().catch(() => [] as Occasion[]),
  ]);
  const featuredProducts = products.slice(0, 10);
  const photos = categoryPhotos(categories, products);
  const live = allOccasions.filter((o) => o.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const occasions = live.length > 0 ? live : FALLBACK_OCCASIONS;
  // A measured rate, shown only once there's enough delivery history.
  const trust =
    onTime === null
      ? TRUST
      : [{ icon: CalendarCheck, title: `${onTime}% on the chosen day`, desc: "Measured over the last 90 days" }, ...TRUST];

  return (
    <div>
      {/* Hero (layout decision: occasion-first). City, day and occasion in the first tap. */}
      <section className="px-4 pt-6 md:pt-10">
        <div className="container mx-auto rounded-3xl bg-primary-soft px-5 py-8 sm:px-8 md:px-12 md:py-14">
          <div className="max-w-4xl space-y-5">
            <p className="text-sm font-medium uppercase tracking-wider text-primary-soft-foreground">
              Gifts delivered across Pakistan, same day in many cities
            </p>
            <h1 className="text-display text-foreground">
              Send love home,{" "}
              <span className="italic text-primary-700 dark:text-primary-300">delivered fresh.</span>
            </h1>
            <Zari />
            <HeroFinder occasions={occasions.map(({ slug, name }) => ({ slug, name }))} />
            <p className="text-sm text-muted-foreground">Cash on delivery · No account needed · Card message included</p>
          </div>
        </div>
      </section>

      {/* Occasions as photo tiles; a tinted tile where no banner exists yet */}
      <section aria-labelledby="occasions-heading" className="px-4 pt-12">
        <div className="container mx-auto">
          <h2 id="occasions-heading" className="text-h2">
            Shop by occasion
          </h2>
          <Zari className="mb-6 mt-3" />
          <ul className="grid grid-cols-3 gap-3 sm:gap-4 lg:grid-cols-6">
            {occasions.slice(0, 6).map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/occasion/${o.slug}`}
                  className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="relative block aspect-square overflow-hidden rounded-xl bg-primary-soft">
                    {o.banner_url ? (
                      <span className="absolute inset-0 transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]">
                        <Photo src={o.banner_url} alt="" sizes="(max-width: 1024px) 33vw, 16vw" />
                      </span>
                    ) : (
                      <Gift aria-hidden className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-primary-soft-foreground/60" />
                    )}
                  </span>
                  <span className="mt-2 block text-sm font-semibold group-hover:underline">{o.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Featured */}
      {featuredProducts.length > 0 && (
        <section aria-labelledby="featured-heading" className="px-4 pb-14 pt-4">
          <div className="container mx-auto">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <h2 id="featured-heading" className="text-h2">
                  Popular gifts
                </h2>
                <Zari className="mt-3" />
              </div>
              <Link href="/search" className="text-sm font-medium text-link hover:underline">
                View all <span aria-hidden>→</span>
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-6">
              {featuredProducts.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <SameDayRail />

      {/* Build your own: only once a builder is live with items (ADR 0014) */}
      {builders.length > 0 && (
        <section aria-labelledby="build-heading" className="px-4 pt-14">
          <div className="container mx-auto">
            <h2 id="build-heading" className="text-h2">Build your own</h2>
            <p className="mt-2 text-muted-foreground">
              Pick every stem or gift yourself, and share the link so family can build it with you.
            </p>
            <Zari className="mb-8 mt-3" />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {builders.map((b) => (
                <li key={b.slug}>
                  <Link
                    href={`/build/${b.slug}`}
                    className="group flex items-center gap-4 rounded-xl border bg-card p-3 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-primary-soft">
                      {b.image && <Photo src={b.image} alt="" sizes="80px" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-lg leading-tight">{b.name}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {b.kind === "bouquet" ? "Bouquet" : "Hamper"} · start building →
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Categories: photo tiles; a tinted tile only where no product photo exists yet */}
      <section aria-labelledby="categories-heading" className="px-4 py-14">
        <div className="container mx-auto">
          <h2 id="categories-heading" className="text-h2">
            Shop by category
          </h2>
          <Zari className="mb-8 mt-3" />
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
            {CATEGORIES.map(({ name, slug, icon: Icon, desc }) => {
              const photo = photos[slug];
              return (
                <li key={slug}>
                  <Link
                    href={`/c/${slug}`}
                    className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-xl bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {photo ? (
                      <>
                        <span className="absolute inset-0 transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]">
                          <Photo src={photo} alt="" sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 16vw" />
                        </span>
                        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      </>
                    ) : (
                      <Icon aria-hidden className="absolute left-1/2 top-[38%] h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-primary-soft-foreground/60" />
                    )}
                    <span className={`relative p-3 sm:p-4 ${photo ? "text-white" : "text-foreground"}`}>
                      <span className="block font-display text-lg leading-tight sm:text-xl">{name}</span>
                      <span className={`mt-0.5 block text-xs ${photo ? "text-white/85" : "text-muted-foreground"}`}>{desc}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* How it works: three open columns with serif numerals */}
      <section aria-labelledby="how-heading" className="px-4 py-14">
        <div className="container mx-auto">
          <h2 id="how-heading" className="text-h2">
            How it works
          </h2>
          <Zari className="mb-8 mt-3" />
          <ol className="grid gap-8 md:grid-cols-3 md:gap-10">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span aria-hidden className="block font-display text-5xl leading-none text-gold">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-sans text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust: one quiet band, brand colours only */}
      <section aria-label={`Why ${brand.name}`} className="border-t px-4 py-10">
        <ul
          className={`container mx-auto grid grid-cols-2 gap-x-6 gap-y-8 ${trust.length > 4 ? "md:grid-cols-5" : "md:grid-cols-4"}`}
        >
          {trust.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-gold-ink" />
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
