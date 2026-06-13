export default async function OccasionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="container mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold mb-2 capitalize">Occasion: {slug}</h1>
      <p className="text-muted-foreground">Products coming soon</p>
    </div>
  );
}
