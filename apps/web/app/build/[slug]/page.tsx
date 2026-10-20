"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { bucketsApi } from "@/lib/buckets";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import { EmptyState } from "@/components/ui/empty-state";

/** Starts a new bucket from a builder and moves to its shareable editing link. */
export default function StartBuilderPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    bucketsApi
      .create(slug, accessToken)
      .then((b) => router.replace(`/build/b/${b.id}?t=${encodeURIComponent(b.share_token ?? "")}`))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.detail : "Something went wrong"));
  }, [slug, accessToken, router]);

  if (error) return <EmptyState title="Can't start this builder" description={error} />;
  return <p className="py-16 text-center text-muted-foreground" aria-live="polite">Setting up your bucket…</p>;
}
