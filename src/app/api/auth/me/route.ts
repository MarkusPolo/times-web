import { NextResponse } from "next/server";
import { getAuth } from "@/src/lib/auth";
import { ensureDbs, usersFindByEmail } from "@/src/lib/couch";
import { AppUser } from "@/src/lib/types";

export async function GET() {
  const { user } = getAuth();
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

  await ensureDbs();
  const found = await usersFindByEmail<AppUser>(user.email);
  const u = found.docs[0];

  return NextResponse.json({
    authenticated: true,
    user: {
      sub: user.sub,
      role: user.role,
      email: user.email,
      mustChangePassword: !!u?.mustChangePassword
    }
  });
}
