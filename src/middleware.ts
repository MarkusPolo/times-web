import { NextRequest, NextResponse } from "next/server";

export const config = {
  // Security-Header überall; der /app*-Zugangscheck bleibt unten
  matcher: ["/:path*"],
};

function applySecurityHeaders(req: NextRequest, resp: NextResponse) {
  const isProd = process.env.NODE_ENV === "production";
  const path = req.nextUrl.pathname;

  // Im DEV-Modus: für Next-Dev-Assets KEINE CSP setzen, damit HMR/Client-JS sicher funktioniert
  const isNextAsset = path.startsWith("/_next") || path.startsWith("/__nextjs") || path.startsWith("/favicon.ico");

  // Baseline-Header
  resp.headers.set("Referrer-Policy", "no-referrer");
  resp.headers.set("X-Content-Type-Options", "nosniff");
  resp.headers.set("X-Frame-Options", "DENY");
  resp.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), usb=(), payment=(), accelerometer=(), magnetometer=(), gyroscope=()"
  );

  // CSP
  if (isProd) {
    // Production: restriktiv
    resp.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "img-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join("; ")
    );
    // Für HTTPS später optional:
    // resp.headers.set("Strict-Transport-Security","max-age=31536000; includeSubDomains; preload");
  } else {
    // Development: sehr tolerant – aber NICHT auf /_next beschränken, damit Seiten auch funktionieren
    // Für /_next/* ganz ohne CSP (isNextAsset=true) – erleichtert HMR/Client Hydration
    if (!isNextAsset) {
      resp.headers.set(
        "Content-Security-Policy",
        [
          "default-src 'self' http: https:",
          "img-src 'self' data: blob: http: https:",
          "style-src 'self' 'unsafe-inline' http: https:",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: http: https:",
          "connect-src 'self' ws: wss: http: https:",
          "font-src 'self' data: http: https:",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join("; ")
      );
    }
  }

  return resp;
}

export function middleware(req: NextRequest) {
  // Zugangskontrolle nur für /app/*
  if (req.nextUrl.pathname.startsWith("/app")) {
    const accessPublic = req.cookies.get("access_token_public")?.value;
    const refresh = req.cookies.get("refresh_token")?.value;
    if (!accessPublic && !refresh) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  const resp = NextResponse.next();
  return applySecurityHeaders(req, resp);
}
