import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AppUser } from "@/src/lib/types";
import { signAccessToken, signRefreshToken } from "@/src/lib/jwt";
import { ensureDbs, usersFindByEmail, usersUpdate, auditInsert } from "@/src/lib/couch";
import { rateLimit } from "@/src/app/api/_utils/rate";

export async function POST(req: NextRequest) {
  // rudimentäres Rate-Limit pro IP
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0] || "local";
  const rl = rateLimit(`login:${ip}`);
  if (!rl.ok) return NextResponse.json({ error: "rate limit" }, { status: 429 });

  const body = await req.json();
  const { email, password } = body as { email: string; password: string };

  if (!email || !password) return NextResponse.json({ error: "email/password required" }, { status: 400 });

  await ensureDbs();
  const found = await usersFindByEmail<AppUser>(email);
  if (!found.docs.length) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });

  const doc = found.docs[0];
  const ok = await bcrypt.compare(password, doc.passwordHash);
  if (!ok) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });

  // Refresh-Version rotieren
  const nextVer = (doc.refreshVer || 0) + 1;
  await usersUpdate<AppUser>(doc._id!, doc._rev!, { refreshVer: nextVer });

  const access = signAccessToken({ sub: doc._id!, role: doc.role, email: doc.email }, "15m");
  const refresh = signRefreshToken({ sub: doc._id!, email: doc.email, ver: nextVer }, "7d");

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

  const common = { path: "/", sameSite: "lax", secure: false } as const;
  resp.cookies.set("access_token", access, { ...common, httpOnly: true, maxAge: 60 * 15 });
  resp.cookies.set("access_token_public", access, { ...common, httpOnly: false, maxAge: 60 * 15 });
  resp.cookies.set("refresh_token", refresh, { ...common, httpOnly: true, maxAge: 60 * 60 * 24 * 7 });

  return resp;
}
