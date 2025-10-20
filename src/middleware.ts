import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/app/:path*"]
};

export function middleware(req: NextRequest) {
  const accessPublic = req.cookies.get("access_token_public")?.value;
  const refresh = req.cookies.get("refresh_token")?.value;

  if (accessPublic || refresh) {
    // Client kümmert sich um Access-Refresh via /api/auth/access
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", req.url));
}
