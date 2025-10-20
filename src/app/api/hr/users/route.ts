import { NextRequest, NextResponse } from "next/server";
import { ensureDbs, usersAll, usersFindByEmail, usersInsert } from "@/src/lib/couch";
import { AppUser } from "@/src/lib/types";
import bcrypt from "bcryptjs";
import { getAuth } from "@/src/lib/auth";

function forbid() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function GET() {
  const { user } = getAuth();
  if (!user || (user.role !== "reviewer" && user.role !== "admin")) return forbid();
  await ensureDbs();
  const res = await usersAll<AppUser>(500);
  const clean = res.docs.map((u) => ({ id: u._id, email: u.email, role: u.role, mustChangePassword: !!u.mustChangePassword }));
  return NextResponse.json({ users: clean });
}

export async function POST(req: NextRequest) {
  const { user } = getAuth();
  if (!user || (user.role !== "reviewer" && user.role !== "admin")) return forbid();

  const body = await req.json();
  const { email, role, tempPassword } = body as { email: string; role?: AppUser["role"]; tempPassword?: string };

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  await ensureDbs();

  const exists = await usersFindByEmail<AppUser>(email);
  if (exists.docs.length) return NextResponse.json({ error: "email exists" }, { status: 409 });

  const pwd = tempPassword && tempPassword.length >= 8 ? tempPassword : Math.random().toString(36).slice(-10) + "A1";
  const passwordHash = await bcrypt.hash(pwd, 12);

  const doc: AppUser = {
    email,
    passwordHash,
    role: role ?? "employee",
    createdAt: new Date().toISOString(),
    mustChangePassword: true
  };
  const ins = await usersInsert(doc);
  return NextResponse.json({ ok: true, user: { id: ins.id, email, role: doc.role, tempPassword: pwd } });
}
