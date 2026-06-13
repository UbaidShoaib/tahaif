import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Gift, Cake, Flower, ShoppingBag, Star, Truck, Shield } from "lucide-react";
import { catalogApi } from "@/lib/catalog";
import { ProductCard } from "@/components/catalog/ProductCard";

const CATEGORIES = [
  { name: "Cakes", slug: "cakes", emoji: "🎂", desc: "Birthday, wedding & custom cakes" },
  { name: "Flowers", slug: "flowers", emoji: "🌹", desc: "Fresh bouquets & arrangements" },
  { name: "Chocolates", slug: "chocolates", emoji: "🍫", desc: "Premium imported & local" },
  { name: "Perfumes", slug: "perfumes", emoji: "🌸", desc: "J. Collection, Maria B & more" },
  { name: "Mithai", slug: "mithai", emoji: "🍬", desc: "Traditional Pakistani sweets" },
  { name: "Combo Gifts", slug: "combo-gifts", emoji: "🎁", desc: "Curated gift sets & hampers" },
];

const OCCASIONS = [
  { name: "Birthday", slug: "birthday", emoji: "🎂" },
  { name: "Eid ul Fitr", slug: "eid-ul-fitr", emoji: "🌙" },
  { name: "Anniversary", slug: "anniversary", emoji: "💑" },
  { name: "Mother's Day", slug: "mothers-day", emoji: "💐" },
  { name: "Wedding", slug: "wedding", emoji: "💍" },
  { name: "Aqiqa", slug: "aqiqa", emoji: "🐑" },
];

const FEATURES = [
  { icon: Truck, title: "Same-day delivery", desc: "Order before cutoff, delivered today in select cities" },
  { icon: Shield, title: "Quality guaranteed", desc: "Freshness promise on all cakes and flowers" },
  { icon: Star, title: "Trusted vendors", desc: "Partnered with Pakistan's top bakeries and florists" },
];

export default async function HomePage() {
  const { items: featuredProducts } = await catalogApi
    .getProducts({ page_size: 8 })
    .catch(() => ({ items: [], total: 0, page: 1, page_size: 8 }));

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium">
            <Gift className="h-4 w-4" />
            <span>Send gifts across Pakistan</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">
            Make every moment<br />unforgettable
          </h1>
          <p className="text-lg text-primary-100 max-w-xl mx-auto">
            Cakes, flowers, perfumes and more — delivered to your loved ones in Karachi, Lahore, Islamabad and beyond.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/search">
              <Button size="lg" variant="secondary" className="gap-2">
                <ShoppingBag className="h-5 w-5" />
                Browse all gifts
              </Button>
            </Link>
            <Link href="/c/cakes">
              <Button size="lg" variant="outline" className="gap-2 border-white text-white hover:bg-white/10">
                <Cake className="h-5 w-5" />
                Shop cakes
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Occasions */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto">
          <h2 className="text-xl font-semibold mb-6 text-center">Shop by occasion</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {OCCASIONS.map((o) => (
              <Link
                key={o.slug}
                href={`/occasion/${o.slug}`}
                className="flex items-center gap-2 bg-background border rounded-full px-4 py-2 text-sm font-medium hover:border-primary-600 hover:text-primary-600 transition-colors"
              >
                <span>{o.emoji}</span>
                <span>{o.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-14 px-4">
        <div className="container mx-auto">
          <h2 className="text-2xl font-bold mb-8">Shop by category</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES.map((cat) => (
              <Link key={cat.slug} href={`/c/${cat.slug}`}>
                <Card className="hover:border-primary-500 hover:shadow-md transition-all cursor-pointer h-full">
                  <CardContent className="p-4 text-center space-y-2">
                    <div className="text-4xl">{cat.emoji}</div>
                    <div className="font-semibold text-sm">{cat.name}</div>
                    <div className="text-xs text-muted-foreground">{cat.desc}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured products */}
      {featuredProducts.length > 0 && (
        <section className="py-14 px-4 bg-muted/20">
          <div className="container mx-auto">
            <div className="flex items-baseline justify-between mb-8">
              <h2 className="text-2xl font-bold">Featured gifts</h2>
              <Link href="/search" className="text-sm text-primary-600 hover:underline font-medium">
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {featuredProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-14 px-4 bg-muted/30">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4 items-start">
                <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                  <f.icon className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 text-center">
        <div className="container mx-auto max-w-xl space-y-4">
          <Flower className="h-10 w-10 mx-auto text-primary-600" />
          <h2 className="text-2xl font-bold">Ready to send a gift?</h2>
          <p className="text-muted-foreground">
            Browse our catalog and find the perfect gift for any occasion.
          </p>
          <Link href="/search">
            <Button size="lg">Browse all gifts</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
