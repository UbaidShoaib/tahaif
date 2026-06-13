import { type NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/account", "/checkout", "/vendor", "/admin"];
const ROLE_GATES: Record<string, string[]> = {
  "/admin": ["admin", "staff"],
  "/vendor": ["vendor", "admin"],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
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
  for (const [prefix, allowedRoles] of Object.entries(ROLE_GATES)) {
    if (pathname.startsWith(prefix)) {
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
