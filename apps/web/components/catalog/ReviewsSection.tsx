"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { loyaltyApi, type ReviewCreate, type ReviewRead } from "@/lib/loyalty";

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span role="img" className="flex gap-0.5" aria-label={`${rating} out of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} aria-hidden className={i < rating ? "text-star" : "text-muted-foreground"}>
          {i < rating ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

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
    <div className="mt-12">
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-xl font-bold">Customer Reviews</h2>
        {avgRating !== null && (
          <div className="flex items-center gap-2">
            <StarRating rating={Math.round(avgRating)} />
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
                <StarRating rating={r.rating} />
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
        <div className="border border-primary-700/30 bg-primary-700/5 rounded-xl p-4 text-sm text-link font-medium">
          Thanks for your review! It will appear after moderation.
        </div>
      ) : (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Write a Review</h3>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <fieldset>
            <legend className="text-sm font-medium mb-1 block">Rating</legend>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-pressed={n === rating}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-md text-2xl ${n <= rating ? "text-star" : "text-muted-foreground"}`}
                  aria-label={`${n} star`}
                >
                  <span aria-hidden>{n <= rating ? "★" : "☆"}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="review-title" className="text-sm font-medium mb-1 block">
              Title <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              placeholder="Summary of your experience"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="review-body" className="text-sm font-medium mb-1 block">
              Review <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="review-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Tell others about your experience…"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="bg-primary-700 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Review"}
          </button>
        </form>
      )}
    </div>
  );
}
