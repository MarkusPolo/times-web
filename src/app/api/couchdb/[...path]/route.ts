// times-web/app/api/couchdb/[...path]/route.ts
// Node-Runtime Reverse Proxy von /api/couchdb/* -> CouchDB
// - prüft Bearer (JWT) vom Client
// - spricht CouchDB mit Basic (Admin) an
// - unterstützt GET/HEAD/POST/PUT/DELETE/OPTIONS
// - deaktiviert Static Generation & Edge

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/src/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const couchUrl = process.env.COUCHDB_URL!;
const adminUser = process.env.COUCHDB_ADMIN_USER!;
const adminPass = process.env.COUCHDB_ADMIN_PASS!;

function unauthorized(msg = "unauthorized") {
  return NextResponse.json({ error: "unauthorized", reason: msg }, { status: 401 });
}

function buildTarget(req: NextRequest, pathParam: string[]) {
  const path = pathParam.join("/");
  const qs = req.nextUrl.search || "";
  // /api/couchdb/<path> -> <COUCHDB_URL>/<path>
  return `${couchUrl}/${path}${qs}`;
}

function sanitizeHeaders(req: NextRequest) {
  // kopiere Header, entferne hop-by-hop & ersetze Authorization
  const h = new Headers(req.headers);
  h.delete("host");
  h.delete("connection");
  h.delete("content-length");
  h.delete("transfer-encoding");
  h.delete("proxy-authorization"); // sicherheitshalber
  // Wir setzen gleich Basic für CouchDB:
  const basic = "Basic " + Buffer.from(`${adminUser}:${adminPass}`).toString("base64");
  h.set("authorization", basic);
  return h;
}

async function forward(req: NextRequest, ctx: { params: { path: string[] } }) {
  // 1) Bearer prüfen (vom Browser)
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!bearer) return unauthorized("missing bearer");
  try {
    verifyAccessToken(bearer);
  } catch {
    return unauthorized("invalid token");
  }

  // 2) Ziel bauen
  const target = buildTarget(req, ctx.params.path);

  // 3) Request vorbereiten
  const method = req.method.toUpperCase();
  const headers = sanitizeHeaders(req);

  let body: BodyInit | undefined = undefined;
  if (!["GET", "HEAD"].includes(method)) {
    // rohen Body durchreichen (PouchDB sendet JSON/Bulk-Bodies)
    const ab = await req.arrayBuffer();
    body = ab;
  }

  // 4) an CouchDB schicken
  const res = await fetch(target, {
    method,
    headers,
    body,
    // wichtig: kein Caching/Proxy
    redirect: "manual"
  });

  // 5) Antwort-Header filtern & durchreichen
  const outHeaders = new Headers(res.headers);
  outHeaders.delete("transfer-encoding");
  outHeaders.delete("connection");
  // CORS nicht nötig (same-origin), aber unkritisch:
  outHeaders.set("access-control-expose-headers", "*");

  return new NextResponse(res.body, {
    status: res.status,
    headers: outHeaders
  });
}

// Die Handler für die Methoden:
export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}
export async function HEAD(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx);
}
// Manche Browser schicken vorab OPTIONS – gib 204 zurück
export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
