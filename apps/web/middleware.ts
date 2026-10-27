import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_ROLES, BACK_OFFICE_ROLES } from "@/lib/roles";

// /vendor/[slug] is a public storefront, so only the portal routes under
// /vendor are protected — not the whole prefix.
const VENDOR_PORTAL = ["/vendor/dashboard", "/vendor/orders", "/vendor/products"];
// Checkout is open to guests (ADR 0004), so it isn't gated here.
const PROTECTED = ["/account", "/admin", ...VENDOR_PORTAL];
const ROLE_GATES: [string[], string[]][] = [
  [["/admin"], BACK_OFFICE_ROLES],
  [VENDOR_PORTAL, ["vendor", ...ADMIN_ROLES]],
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
  matcher: ["/account/:path*", "/vendor/:path*", "/admin/:path*"],
};
