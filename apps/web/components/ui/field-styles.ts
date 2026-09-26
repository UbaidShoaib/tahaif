/**
 * Shared classes for text-like form controls (Input, Textarea, Select) so they
 * look and behave identically: 16px text on mobile (prevents iOS zoom), a 3:1
 * border from the --input token, a visible focus ring and an error state driven
 * by `aria-invalid`.
 */
export const fieldBase =
  "w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background sm:text-sm " +
  "placeholder:text-muted-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive";
