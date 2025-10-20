import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRefreshToken, signAccessToken } from "@/src/lib/jwt";
import { ensureDbs, usersFindByEmail } from "@/src/lib/couch";
import { AppUser } from "@/src/lib/types";

export async function POST() {
  const refresh = cookies().get("refresh_token")?.value;
  if (!refresh) return NextResponse.json({ error: "no refresh" }, { status: 401 });

  try {
    const ref = verifyRefreshToken(refresh);
    await ensureDbs();
    const u = await usersFindByEmail<AppUser>(ref.email);
    if (!u.docs.length) return NextResponse.json({ error: "user missing" }, { status: 401 });
    const doc = u.docs[0];

    const access = signAccessToken({ sub: doc._id!, role: doc.role, email: doc.email }, "15m");

    const resp = NextResponse.json({ token: access });

    // httpOnly ACCESS cookie erneuern (für getAuth()/api/auth/me)
    resp.cookies.set("access_token", access, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 15
    });

    // optional: public Cookie (deine Middleware schaut darauf)
    resp.cookies.set("access_token_public", access, {
      httpOnly: false,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 15
    });

    return resp;
  } catch {
    return NextResponse.json({ error: "invalid refresh" }, { status: 401 });
  }
}
