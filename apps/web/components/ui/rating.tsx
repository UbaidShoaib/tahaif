"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-6 w-6" } as const;

/** Read-only star rating, announced as one image: "4 out of 5 stars". */
export function Rating({
  value,
  max = 5,
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const rounded = Math.round(value);
  return (
    <span role="img" aria-label={`${value} out of ${max} stars`} className={cn("inline-flex gap-0.5", className)}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(SIZES[size], "text-star", i < rounded ? "fill-current" : "fill-transparent")}
        />
      ))}
    </span>
  );
}

/**
 * Star rating input: a fieldset of 5 native radios, so arrow keys and screen
 * readers work ("3 stars, radio, 3 of 5").
 */
export function RatingInput({
  value,
  onChange,
  legend = "Rating",
  max = 5,
  name,
}: {
  value: number;
  onChange: (value: number) => void;
  legend?: string;
  max?: number;
  name?: string;
}) {
  const generated = React.useId();
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1;
          return (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name={name ?? generated}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              <span className="sr-only">{n === 1 ? "1 star" : `${n} stars`}</span>
              <Star
                aria-hidden
                className={cn("h-7 w-7 text-star", n <= shown ? "fill-current" : "fill-transparent")}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
