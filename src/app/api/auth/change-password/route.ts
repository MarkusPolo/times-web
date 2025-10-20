import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureDbs, usersUpdate } from "@/src/lib/couch";
import { usersFindByEmail } from "@/src/lib/couch";
import { AppUser } from "@/src/lib/types";
import { getAuth } from "@/src/lib/auth";

export async function POST(req: NextRequest) {
  const { user } = getAuth();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { oldPassword, newPassword } = body as { oldPassword: string; newPassword: string };
  if (!oldPassword || !newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  await ensureDbs();

  const found = await usersFindByEmail<AppUser>(user.email);
  if (!found.docs.length) return NextResponse.json({ error: "user not found" }, { status: 404 });

  const u = found.docs[0];
  const ok = await bcrypt.compare(oldPassword, u.passwordHash);
  if (!ok) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });

  const newHash = await bcrypt.hash(newPassword, 12);
  await usersUpdate<AppUser>(u._id!, u._rev!, { passwordHash: newHash, mustChangePassword: false });

  return NextResponse.json({ ok: true });
}
