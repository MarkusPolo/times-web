import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "@/src/lib/jwt";
import { ensureDbs, usersFindByEmail, usersUpdate } from "@/src/lib/couch";
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

    // ver muss exakt passen, sonst ist das Refresh-Token ungültig (Replay-Schutz)
    const currentVer = doc.refreshVer || 0;
    if (ref.ver !== currentVer) {
      return NextResponse.json({ error: "refresh version mismatch" }, { status: 401 });
    }

    // Token-Rotation: Version ++, neuen Refresh + neuen Access ausstellen
    const nextVer = currentVer + 1;
    await usersUpdate<AppUser>(doc._id!, doc._rev!, { refreshVer: nextVer });

    const access = signAccessToken({ sub: doc._id!, role: doc.role, email: doc.email }, "15m");
    const newRefresh = signRefreshToken({ sub: doc._id!, email: doc.email, ver: nextVer }, "7d");

    const resp = NextResponse.json({ token: access });

    const common = { path: "/", sameSite: "lax", secure: false } as const;
    resp.cookies.set("access_token", access, { ...common, httpOnly: true, maxAge: 60 * 15 });
    resp.cookies.set("access_token_public", access, { ...common, httpOnly: false, maxAge: 60 * 15 });
    resp.cookies.set("refresh_token", newRefresh, { ...common, httpOnly: true, maxAge: 60 * 60 * 24 * 7 });

    return resp;
  } catch {
    return NextResponse.json({ error: "invalid refresh" }, { status: 401 });
  }
}
