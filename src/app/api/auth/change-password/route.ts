// src/app/api/auth/change-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ensureDbs, usersUpdate, usersFindByEmail, auditInsert } from "@/src/lib/couch";
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

  await auditInsert({
    ts: new Date().toISOString(),
    type: "password_change",
    actorId: u._id!,
    actorEmail: u.email
  });

  return NextResponse.json({ ok: true });
}
