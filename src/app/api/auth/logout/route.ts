import { NextResponse } from "next/server";

export async function POST() {
  const resp = NextResponse.json({ ok: true });

  // Alle auth-relevanten Cookies wegräumen
  const common = { path: "/", sameSite: "lax", secure: false } as const;
  resp.cookies.set("access_token", "", { ...common, httpOnly: true, maxAge: 0 });
  resp.cookies.set("access_token_public", "", { ...common, httpOnly: false, maxAge: 0 });
  resp.cookies.set("refresh_token", "", { ...common, httpOnly: true, maxAge: 0 });

  return resp;
}
