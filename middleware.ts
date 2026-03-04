import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAuthorizedBasicAuth } from "@/lib/security/admin-auth";

export function middleware(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/admin/restock") || path.startsWith("/api/admin/restock");

  if (!isProtected) {
    return NextResponse.next();
  }

  if (isAuthorizedBasicAuth(request.headers.get("authorization"))) {
    return NextResponse.next();
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Restock Raven Admin"'
    }
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
