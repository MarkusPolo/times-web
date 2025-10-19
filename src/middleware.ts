import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/app/:path*"]
};

export function middleware(req: NextRequest) {
  // Nur prüfen, ob irgendein Token-Cookie existiert.
  const httpOnly = req.cookies.get("access_token")?.value;
  const publicToken = req.cookies.get("access_token_public")?.value;

  if (httpOnly || publicToken) {
    // reinlassen; echte Prüfung macht /api/auth/me im App-Code
    return NextResponse.next();
  }

  // kein Token -> zurück zum Login
  return NextResponse.redirect(new URL("/login", req.url));
}
