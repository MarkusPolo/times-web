import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/src/lib/auth";
import { ensureDbs, timesUpdate } from "@/src/lib/couch";

function forbid() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const { user } = getAuth();
  if (!user || (user.role !== "reviewer" && user.role !== "admin")) return forbid();

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await ensureDbs();
  await timesUpdate(id, {
    approved: true,
    approvedBy: user.sub,
    approvedAt: new Date().toISOString(),
    deniedReason: null as any
  });

  return NextResponse.json({ ok: true });
}
