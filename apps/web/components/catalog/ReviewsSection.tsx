"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { loyaltyApi, type ReviewCreate, type ReviewRead } from "@/lib/loyalty";

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of ${max} stars`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < rating ? "text-amber-400" : "text-muted"}>
          ★
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
          <a href="/login" className="text-[#16a34a] hover:underline">Sign in</a> to leave a review.
        </p>
      ) : submitted ? (
        <div className="border border-[#16a34a]/30 bg-[#16a34a]/5 rounded-xl p-4 text-sm text-[#16a34a] font-medium">
          Thanks for your review! It will appear after moderation.
        </div>
      ) : (
        <form onSubmit={(e) => { void handleSubmit(e); }} className="border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold">Write a Review</h3>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div>
            <label className="text-sm font-medium mb-1 block">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`text-2xl ${n <= rating ? "text-amber-400" : "text-muted"}`}
                  aria-label={`${n} star`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

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
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#16a34a]/40"
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
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#16a34a]/40 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="bg-[#16a34a] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#15803d] disabled:opacity-50 transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Review"}
          </button>
        </form>
      )}
    </div>
  );
}
