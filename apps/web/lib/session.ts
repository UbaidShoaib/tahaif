import Cookies from "js-cookie";

/**
 * Non-httpOnly marker that tells the Next.js middleware a session probably
 * exists and which role it has (the refresh token itself is httpOnly and
 * invisible to the middleware). It is a routing hint only: every API call is
 * authorised server-side, so a forged marker exposes page shells, not data.
 */
export const SESSION_COOKIE = "tahaif_session";

/** Matches the API's refresh_token_expire_days. */
const SESSION_DAYS = 7;

export function setSessionMarker(role: string): void {
  Cookies.set(SESSION_COOKIE, role, { sameSite: "lax", expires: SESSION_DAYS });
}

export function clearSessionMarker(): void {
  Cookies.remove(SESSION_COOKIE);
}

export function hasSessionMarker(): boolean {
  return Boolean(Cookies.get(SESSION_COOKIE));
}
