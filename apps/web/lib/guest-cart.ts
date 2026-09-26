/**
 * Guest cart token (ADR 0004): issued by the API on a guest's first add, kept in
 * localStorage, and sent back as the X-Cart-Token header on cart and checkout
 * calls. A header rather than a cookie, because the web and API are different
 * sites and third-party cookies are blocked in Safari.
 */
const KEY = "tahaif_cart_token";

export function getGuestCartToken(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setGuestCartToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode: the cart lasts for this page only */
  }
}

/** Header for cart/checkout requests, if this browser holds a guest cart. */
export function guestCartHeaders(): Record<string, string> {
  const token = getGuestCartToken();
  return token ? { "X-Cart-Token": token } : {};
}

/**
 * Keep the stored token in step with a cart response: a guest cart returns its
 * token; a signed-in cart returns none, meaning any guest cart was merged into it.
 */
export function syncGuestCartToken(cart: { guest_token?: string | null }, signedIn: boolean): void {
  if (cart.guest_token) setGuestCartToken(cart.guest_token);
  else if (signedIn) setGuestCartToken(null);
}
