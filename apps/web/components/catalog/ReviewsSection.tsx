"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Rating, RatingInput } from "@/components/ui/rating";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth.store";
import { loyaltyApi, type ReviewCreate, type ReviewRead } from "@/lib/loyalty";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  productId: string;
  initialReviews: ReviewRead[];
}

export function ReviewsSection({ productId, initialReviews }: Props) {
  const { accessToken } = useAuthStore();
  const pathname = usePathname();
  const reviews = initialReviews;
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: ReviewCreate = { product_id: productId, rating, title: title || null, body: body || null };
      await loyaltyApi.submitReview(payload, accessToken);
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit review.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="mt-12 scroll-mt-20">
      <div className="flex items-center gap-4 mb-6">
        <h2 id="reviews-heading" className="text-h2">Customer Reviews</h2>
        {avgRating !== null && (
          <div className="flex items-center gap-2">
            <Rating value={Number(avgRating.toFixed(1))} />
            <span className="text-sm text-muted-foreground">
              {avgRating.toFixed(1)} ({reviews.length})
            </span>
          </div>
        )}
      </div>

      {/* Review list */}
      {reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm mb-8">No reviews yet. Be the first!</p>
      ) : (
        <ul className="space-y-4 mb-8">
          {reviews.map((r) => (
            <li key={r.id} className="border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <Rating value={r.rating} size="sm" />
                {r.title && <span className="font-semibold text-sm">{r.title}</span>}
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDate(r.created_at)}
                </span>
              </div>
              {r.body && <p className="text-sm text-muted-foreground">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Submit form */}
      {!accessToken ? (
        <p className="text-sm text-muted-foreground">
          <Link href={`/login?callbackUrl=${encodeURIComponent(pathname)}`} className="text-link hover:underline">Sign in</Link> to leave a review.
        </p>
      ) : submitted ? (
        <Alert variant="success">
          <AlertDescription>Thanks for your review! It will appear after moderation.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="border rounded-xl p-5 space-y-4">
          <h3 className="text-h3">Write a Review</h3>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <RatingInput value={rating} onChange={setRating} />

          <FormField label="Title" hint="Optional" id="review-title">
            {(p) => (
              <Input
                {...p}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={255}
                placeholder="Summary of your experience"
              />
            )}
          </FormField>

          <FormField label="Review" hint="Optional" id="review-body">
            {(p) => (
              <Textarea
                {...p}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="Tell others about your experience…"
              />
            )}
          </FormField>

          <Button type="submit" loading={submitting}>
            {submitting ? "Submitting…" : "Submit Review"}
          </Button>
        </form>
      )}
    </section>
  );
}
