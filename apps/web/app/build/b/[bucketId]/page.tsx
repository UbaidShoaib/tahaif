"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { BucketBuilder } from "@/components/builder/BucketBuilder";
import { EmptyState } from "@/components/ui/empty-state";

function SharedBucket() {
  const { bucketId } = useParams<{ bucketId: string }>();
  const token = useSearchParams().get("t");
  if (!token) return <EmptyState title="This link is incomplete" description="Ask for the full bucket link again." />;
  return <BucketBuilder bucketId={bucketId} shareToken={token} />;
}

export default function SharedBucketPage() {
  return (
    <Suspense>
      <SharedBucket />
    </Suspense>
  );
}
