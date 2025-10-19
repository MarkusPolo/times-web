import { NextResponse } from "next/server";

export async function GET() {
  // Vorsicht: nur lokal verwenden! (Enthält Pass im Klartext)
  return NextResponse.json({
    COUCHDB_URL: process.env.COUCHDB_URL,
    COUCHDB_ADMIN_USER: process.env.COUCHDB_ADMIN_USER,
    COUCHDB_ADMIN_PASS: process.env.COUCHDB_ADMIN_PASS
  });
}
