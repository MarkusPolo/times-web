import { NextResponse } from "next/server";

// Einfaches Ping-Endpoint, damit Pouch (oder du) /api/couchdb anfragen kann,
// ohne 405/404-Noise in der Dev-Konsole zu erzeugen.

export function GET() {
  return NextResponse.json({ ok: true, proxy: "couchdb", note: "use /api/couchdb/<db>/<path>" });
}

// Für HEAD/OPTIONS geben wir leere erfolgreiche Antworten zurück:
export function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
