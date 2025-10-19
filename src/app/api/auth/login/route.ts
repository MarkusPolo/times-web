import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AppUser } from "@/src/lib/types";
import { signAccessToken } from "@/src/lib/jwt";
import { ensureDbs, usersFindByEmail } from "@/src/lib/couch";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password } = body as { email: string; password: string };

  if (!email || !password) {
    return NextResponse.json({ error: "email/password required" }, { status: 400 });
  }

  await ensureDbs();

  const found = await usersFindByEmail<AppUser>(email);
  if (!found.docs.length) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const doc = found.docs[0];
  const ok = await bcrypt.compare(password, doc.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const token = signAccessToken({ sub: doc._id!, role: doc.role, email: doc.email });

  const resp = NextResponse.json({ ok: true, user: { id: doc._id, email: doc.email, role: doc.role }, token });
  resp.cookies.set("access_token", token, {
    httpOnly: true,
    sameSite: "lax",  // <= lockerer für Dev
    secure: false,
    path: "/",
    maxAge: 60 * 15
  });
  return resp;
}
