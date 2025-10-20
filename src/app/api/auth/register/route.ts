import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "self-registration disabled" }, { status: 403 });
}
