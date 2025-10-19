import { NextResponse } from "next/server";

// beantwortet GET /api/couchdb mit 200, damit keine 404-Logs entstehen
export function GET() {
  return NextResponse.json({ ok: true, proxy: "couchdb", note: "use /api/couchdb/<db>/<path>" });
}

// für HEAD/OPTIONS geben wir leere, erfolgreiche Antworten:
export function HEAD() {
  return new NextResponse(null, { status: 200 });
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
