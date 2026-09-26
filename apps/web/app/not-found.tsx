import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="container mx-auto max-w-lg px-4 py-16">
      <EmptyState
        icon={SearchX}
        as="h1"
        title="We couldn't find that page"
        description="The gift or page may have moved, or the link may be mistyped. If you're looking for an order, use the tracking link from your confirmation."
        action={
          <>
            <Button asChild>
              <Link href="/search">Find a gift</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Go to the home page</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
