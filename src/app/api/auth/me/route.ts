import { NextResponse } from "next/server";
import { getAuth } from "@/src/lib/auth";

export async function GET() {
  const { user } = getAuth();
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user });
}
