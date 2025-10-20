import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/src/lib/auth";
import { ensureDbs, timesFind } from "@/src/lib/couch";
import { TimeEntry } from "@/src/lib/types";

function forbid() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const { user } = getAuth();
  if (!user || (user.role !== "reviewer" && user.role !== "admin")) return forbid();

  await ensureDbs();

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const employeeId = url.searchParams.get("employeeId") || "";

  const selector: any = {};
  if (from || to) {
    selector.date = {};
    if (from) selector.date.$gte = from;
    if (to) selector.date.$lte = to;
  }
  if (employeeId) {
    selector.employeeId = employeeId;
  }

  const res = await timesFind<TimeEntry>(selector, 2000);
  return NextResponse.json({ docs: res.docs });
}
