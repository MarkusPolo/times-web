import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AppUser } from "@/src/lib/types";
import { signAccessToken, signRefreshToken } from "@/src/lib/jwt";
import { ensureDbs, usersFindByEmail, auditInsert } from "@/src/lib/couch";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password } = body as { email: string; password: string };

  if (!email || !password) return NextResponse.json({ error: "email/password required" }, { status: 400 });

  await ensureDbs();
  const found = await usersFindByEmail<AppUser>(email);
  if (!found.docs.length) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });

  const doc = found.docs[0];
  const ok = await bcrypt.compare(password, doc.passwordHash);
  if (!ok) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });

  const access = signAccessToken({ sub: doc._id!, role: doc.role, email: doc.email }, "15m");
  const refresh = signRefreshToken({ sub: doc._id!, email: doc.email, ver: 1 }, "7d");

  await auditInsert({
    ts: new Date().toISOString(),
    type: "login",
    actorId: doc._id!,
    actorEmail: doc.email,
    meta: { role: doc.role }
  });

  const resp = NextResponse.json({
    ok: true,
    user: { id: doc._id, email: doc.email, role: doc.role },
    token: access
  });

  // 1) httpOnly ACCESS cookie (15m) -> wichtig für getAuth()/api/auth/me
  resp.cookies.set("access_token", access, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 15
  });

  // 2) httpOnly REFRESH cookie (7d)
  resp.cookies.set("refresh_token", refresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });

  // 3) optionales Public-Cookie für Middleware/Client (15m)
  resp.cookies.set("access_token_public", access, {
    httpOnly: false,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 15
  });

  return resp;
}
