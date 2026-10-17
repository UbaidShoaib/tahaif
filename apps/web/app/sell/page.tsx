import type { Metadata } from "next";
import { SellApplication } from "@/components/vendor/SellApplication";
import { brand } from "@/lib/brand";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sell with us",
  description: `Apply to open your shop on ${brand.name} and deliver gifts across Pakistan.`,
  ...canonical("/sell"),
};

export default function SellPage() {
  return (
    <div className="container mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold">Sell with {brand.name}</h1>
      <p className="mb-8 text-muted-foreground">
        Bakers, florists and gift makers: tell us about your shop. Our team reviews every application before a
        shop goes live.
      </p>
      <SellApplication />
    </div>
  );
}
