export type Messages = { [key: string]: string | Messages };

/** Locale messages over the fallback, so an untranslated key shows English, never a key name. */
export function withFallback(messages: Messages, fallback: Messages): Messages {
  const out: Messages = { ...fallback };
  for (const [key, value] of Object.entries(messages)) {
    const base = fallback[key];
    out[key] = typeof value === "object" && typeof base === "object" ? withFallback(value, base) : value;
  }
  return out;
}
