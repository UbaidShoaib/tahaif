import { type NextRequest, NextResponse } from "next/server";

// /vendor/[slug] is a public storefront, so only the portal routes under
// /vendor are protected — not the whole prefix.
const VENDOR_PORTAL = ["/vendor/dashboard", "/vendor/orders", "/vendor/products"];
const PROTECTED = ["/account", "/checkout", "/admin", ...VENDOR_PORTAL];
const ROLE_GATES: [string[], string[]][] = [
  [["/admin"], ["admin", "staff"]],
  [VENDOR_PORTAL, ["vendor", "admin"]],
];

/** True for the path itself or anything beneath it (not "/adminx"). */
function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some((p) => under(pathname, p));
  if (!isProtected) return NextResponse.next();

  // Refresh token lives in an httpOnly cookie set by the API.
  // We cannot read it here, so we check for a non-httpOnly session marker
  // cookie that the client sets on successful auth.
  const sessionMarker = request.cookies.get("tahaif_session");
  if (!sessionMarker) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role gates: the session marker value contains the user role
  for (const [prefixes, allowedRoles] of ROLE_GATES) {
    if (prefixes.some((p) => under(pathname, p))) {
      const role = sessionMarker.value;
      if (!allowedRoles.includes(role)) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/checkout/:path*", "/vendor/:path*", "/admin/:path*"],
};
