import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalogApi } from "@/lib/catalog";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ChevronRight } from "lucide-react";

type Props = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await catalogApi.getCategoryBySlug(slug[0]);
  if (!category) return { title: "Category Not Found" };
  return { title: category.name };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const categorySlug = slug[0];

  const [category, allCategories, { items: products }] = await Promise.all([
    catalogApi.getCategoryBySlug(categorySlug),
    catalogApi.getCategories(),
    catalogApi
      .getCategoryBySlug(categorySlug)
      .then((cat) =>
        cat
          ? catalogApi.getProducts({ category_id: cat.id, page_size: 48 })
          : { items: [], total: 0, page: 1, page_size: 48 },
      ),
  ]);

  if (!category) notFound();

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{category.name}</span>
      </nav>

      <div className="flex gap-8">
        {/* Sidebar — categories */}
        <aside className="hidden md:block w-52 shrink-0">
          <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
            Categories
          </h3>
          <nav className="space-y-0.5">
            {allCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/c/${cat.slug}`}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  cat.slug === categorySlug
                    ? "bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/40 dark:text-primary-300"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between mb-6">
            <h1 className="text-2xl font-bold">{category.name}</h1>
            <span className="text-sm text-muted-foreground">
              {products.length} item{products.length !== 1 ? "s" : ""}
            </span>
          </div>

          <ProductGrid
            products={products}
            emptyMessage={`No products in ${category.name} yet.`}
          />
        </main>
      </div>
    </div>
  );
}
