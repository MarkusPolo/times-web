import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AppUser } from "@/src/lib/types";
import { signAccessToken } from "@/src/lib/jwt";
import { ensureDbs, usersFindByEmail, usersInsert } from "@/src/lib/couch";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password, role } = body as { email: string; password: string; role?: AppUser["role"] };

  if (!email || !password) {
    return NextResponse.json({ error: "email/password required" }, { status: 400 });
  }

  await ensureDbs();

  const found = await usersFindByEmail<AppUser>(email);
  if (found.docs.length) {
    return NextResponse.json({ error: "email exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user: AppUser = {
    email,
    passwordHash,
    role: role ?? "employee",
    createdAt: new Date().toISOString()
  };

  const res = await usersInsert(user);
  const token = signAccessToken({ sub: res.id, role: user.role, email: user.email });

  const resp = NextResponse.json({ ok: true, user: { id: res.id, email: user.email, role: user.role }, token });
  resp.cookies.set("access_token", token, {
    httpOnly: true,
    sameSite: "lax",  // <= lockerer für Dev
    secure: false,
    path: "/",
    maxAge: 60 * 15
  });
  return resp;
}
