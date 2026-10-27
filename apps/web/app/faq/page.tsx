import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

// A placeholder: kept out of search results until the page has content.
export const metadata: Metadata = { title: "FAQ", ...NOINDEX };

export default function Page() {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-2">FAQ</h1>
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  );
}
