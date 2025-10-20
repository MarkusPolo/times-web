// src/app/api/audit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/src/lib/auth";
import { ensureDbs, auditList } from "@/src/lib/couch";
import { AuditEvent } from "@/src/lib/types";

export async function GET(req: NextRequest) {
  const { user } = getAuth();
  if (!user || (user.role !== "reviewer" && user.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await ensureDbs();
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "200", 10);
  const res = await auditList<AuditEvent>(Math.min(Math.max(limit, 1), 2000));
  return NextResponse.json({ docs: res.docs });
}
