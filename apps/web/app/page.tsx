import Link from "next/link";
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
import { catalogApi, primaryImage, type Product } from "@/lib/catalog";
import { categoryPhotos } from "@/lib/home";
import { isOptimizable } from "@/lib/image-hosts";
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

const OCCASIONS: { name: string; slug: string }[] = [
  { name: "Birthday", slug: "birthday" },
  { name: "Eid ul Fitr", slug: "eid-ul-fitr" },
  { name: "Anniversary", slug: "anniversary" },
  { name: "Mother's Day", slug: "mothers-day" },
  { name: "Wedding", slug: "wedding" },
  { name: "Aqiqa", slug: "aqiqa" },
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
  const [{ items: products }, categories, onTime] = await Promise.all([
    catalogApi.getProducts({ page_size: 48 }).catch(() => ({ items: [] as Product[], total: 0, page: 1, page_size: 48 })),
    catalogApi.getCategories().catch(() => []),
    onTimePercent(),
  ]);
  const featuredProducts = products.slice(0, 8);
  const photos = categoryPhotos(categories, products);
  const heroShots = products.filter((p) => p.images.length > 0).slice(0, 3);
  // A measured rate, shown only once there's enough delivery history.
  const trust =
    onTime === null
      ? TRUST
      : [{ icon: CalendarCheck, title: `${onTime}% on the chosen day`, desc: "Measured over the last 90 days" }, ...TRUST];

  return (
    <div>
      {/* Hero: words and the city finder on the left, real gifts on the right */}
      <section className="bg-background-alt px-4 pb-12 pt-10 md:pb-20 md:pt-16">
        <div className="container mx-auto grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div className="space-y-6">
            <p className="text-sm font-medium uppercase tracking-wider text-gold-ink">Gifts delivered across Pakistan</p>
            <h1 className="text-display text-foreground">
              Send love home,
              <br />
              <span className="italic text-primary-700 dark:text-primary-300">delivered fresh.</span>
            </h1>
            <Zari />
            <p className="max-w-lg text-lg text-foreground-secondary">
              Cakes, flowers, mithai and more for the people you miss, with your own card message, delivered in
              Karachi, Lahore, Islamabad and beyond.
            </p>
            <div className="max-w-lg">
              <HeroFinder />
            </div>
            <p className="text-sm text-muted-foreground">Cash on delivery · No account needed · Card message included</p>
          </div>

          {heroShots.length > 0 && (
            <div className="grid h-72 grid-cols-3 grid-rows-2 gap-3 sm:h-96 lg:h-[30rem]">
              {heroShots.map((p, i) => (
                <div
                  key={p.id}
                  className={`relative overflow-hidden rounded-2xl bg-muted ${
                    i === 0 ? "col-span-2 row-span-2" : heroShots.length === 2 ? "row-span-2" : ""
                  }`}
                >
                  <Photo src={primaryImage(p)} alt={p.name} sizes={i === 0 ? "(max-width: 1024px) 66vw, 33vw" : "20vw"} priority={i === 0} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Occasions: quiet text pills, no emoji */}
      <section aria-labelledby="occasions-heading" className="border-b px-4 py-6">
        <div className="container mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <h2 id="occasions-heading" className="shrink-0 font-sans text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Shop by occasion
          </h2>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {OCCASIONS.map((o) => (
              <li key={o.slug} className="shrink-0">
                <Link
                  href={`/occasion/${o.slug}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-input px-4 text-sm font-medium transition-colors hover:border-primary-700 hover:bg-primary-soft hover:text-primary-soft-foreground"
                >
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SameDayRail />

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

      {/* Featured */}
      {featuredProducts.length > 0 && (
        <section aria-labelledby="featured-heading" className="bg-background-alt px-4 py-14">
          <div className="container mx-auto">
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <h2 id="featured-heading" className="text-h2">
                  Featured gifts
                </h2>
                <Zari className="mt-3" />
              </div>
              <Link href="/search" className="text-sm font-medium text-link hover:underline">
                View all <span aria-hidden>→</span>
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
              {featuredProducts.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

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
