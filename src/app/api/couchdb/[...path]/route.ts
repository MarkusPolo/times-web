// src/app/api/couchdb/[...path]/route.ts
// Reverse Proxy von /api/couchdb/* -> CouchDB
// - prüft Bearer (JWT) vom Client
// - spricht CouchDB mit Basic (Admin) an
// - filtert Audit-Logs, damit nur fachlich relevante Writes ins Log kommen
// - unterstützt GET/HEAD/POST/PUT/DELETE/OPTIONS
// - Node runtime, keine SSG

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/src/lib/jwt";
import { auditInsert } from "@/src/lib/couch";

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
  return `${couchUrl}/${path}${qs}`;
}

function sanitizeHeaders(req: NextRequest) {
  const h = new Headers(req.headers);
  h.delete("host");
  h.delete("connection");
  h.delete("content-length");
  h.delete("transfer-encoding");
  h.delete("proxy-authorization");
  const basic = "Basic " + Buffer.from(`${adminUser}:${adminPass}`).toString("base64");
  h.set("authorization", basic);
  return h;
}

// ---- Audit-Filter-Helpers ----

function isWriteMethod(method: string) {
  return method === "POST" || method === "PUT" || method === "DELETE";
}

function isTimesDbPath(pathParts: string[]) {
  // /api/couchdb/<db>/...  -> pathParts[0] = "<db>"
  return pathParts.length > 0 && pathParts[0] === "times";
}

function isReplicationNoise(pathParts: string[]) {
  // skip replication/checkpoint helpers
  // examples: _local/<id>, _revs_diff, _changes, _bulk_get
  if (pathParts.length < 2) return false;
  const p1 = pathParts[1];
  return (
    p1 === "_revs_diff" ||
    p1 === "_changes" ||
    p1 === "_bulk_get" ||
    p1 === "_design" || // vorsichtshalber
    p1 === "_local"
  );
}

function isBulkDocs(pathParts: string[]) {
  return pathParts[1] === "_bulk_docs";
}

async function parseJsonBody(ab: ArrayBuffer | null) {
  if (!ab) return null;
  try {
    const text = new TextDecoder().decode(ab);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function shortlist<T>(arr: T[], n = 10): T[] {
  return arr.slice(0, n);
}

async function maybeAuditTimesWrite(opts: {
  method: string;
  pathParts: string[];
  status: number;
  actorId?: string;
  actorEmail?: string;
  reqBodyJson: any | null;
}) {
  const { method, pathParts, status, actorId, actorEmail, reqBodyJson } = opts;

  if (!isWriteMethod(method)) return;
  if (!isTimesDbPath(pathParts)) return;
  if (isReplicationNoise(pathParts)) return;

  // Case A: POST /times/_bulk_docs  -> filter docs by type === "time_entry"
  if (isBulkDocs(pathParts)) {
    const docs = Array.isArray(reqBodyJson?.docs) ? reqBodyJson.docs : [];
    const entries = docs.filter((d: any) => d && d.type === "time_entry");
    if (entries.length === 0) return;

    const ids = entries.map((d: any) => d._id).filter(Boolean);
    await auditInsert({
      ts: new Date().toISOString(),
      type: "times_write",
      actorId,
      actorEmail,
      meta: {
        method,
        path: "/times/_bulk_docs",
        status,
        count: entries.length,
        ids: shortlist(ids, 10) // nur Vorschau
      }
    });
    return;
  }

  // Case B: PUT /times/<docId>
  // Nur loggen, wenn Body type === "time_entry"
  if (method === "PUT" && pathParts.length >= 2) {
    const docId = pathParts[1];
    if (docId && !docId.startsWith("_")) {
      if (reqBodyJson && reqBodyJson.type === "time_entry") {
        await auditInsert({
          ts: new Date().toISOString(),
          type: "times_write",
          actorId,
          actorEmail,
          meta: { method, path: `/times/${docId}`, status, id: docId }
        });
      }
    }
    return;
  }

  // Case C: DELETE /times/<docId>  (selten, aber fachlich relevant)
  if (method === "DELETE" && pathParts.length >= 2) {
    const docId = pathParts[1];
    if (docId && !docId.startsWith("_")) {
      await auditInsert({
        ts: new Date().toISOString(),
        type: "times_delete",
        actorId,
        actorEmail,
        meta: { method, path: `/times/${docId}`, status, id: docId }
      });
    }
    return;
  }

  // POST /times (direktes Anlegen ohne _bulk_docs) – kommt bei Pouch selten vor,
  // wir werten es nur, wenn der Body eine time_entry hat.
  if (method === "POST" && pathParts.length === 1) {
    if (reqBodyJson && reqBodyJson.type === "time_entry") {
      await auditInsert({
        ts: new Date().toISOString(),
        type: "times_write",
        actorId,
        actorEmail,
        meta: { method, path: `/times`, status }
      });
    }
  }
}

async function forward(req: NextRequest, ctx: { params: { path: string[] } }) {
  // 1) Bearer prüfen (vom Browser)
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!bearer) return unauthorized("missing bearer");

  let actorEmail: string | undefined;
  let actorId: string | undefined;
  try {
    const payload = verifyAccessToken(bearer);
    actorEmail = (payload as any).email;
    actorId = (payload as any).sub;
  } catch {
    return unauthorized("invalid token");
  }

  // 2) Ziel bauen
  const target = buildTarget(req, ctx.params.path);

  // 3) Request vorbereiten
  const method = req.method.toUpperCase();
  const headers = sanitizeHeaders(req);

  // Body einmal lesen (damit wir ihn ggf. für Audit analysieren können)
  let bodyAb: ArrayBuffer | null = null;
  if (!["GET", "HEAD"].includes(method)) {
    bodyAb = await req.arrayBuffer();
  }

  // 4) an CouchDB schicken
  const res = await fetch(target, {
    method,
    headers,
    body: bodyAb ? bodyAb : undefined,
    redirect: "manual"
  });

  // 5) Antwort-Header filtern & durchreichen
  const outHeaders = new Headers(res.headers);
  outHeaders.delete("transfer-encoding");
  outHeaders.delete("connection");
  outHeaders.set("access-control-expose-headers", "*");

  // 6) Audit (gefiltert) – NACH der Antwort (wir kennen nun den Status)
  try {
    const pathParts = ctx.params.path;
    const status = res.status;
    const reqBodyJson = await parseJsonBody(bodyAb);
    await maybeAuditTimesWrite({
      method,
      pathParts,
      status,
      actorEmail,
      actorId,
      reqBodyJson
    });
  } catch (e) {
    // Audit-Fehler sollen den Proxy nicht stören
    console.warn("[proxy/audit] skipped due to error:", e);
  }

  return new NextResponse(res.body, { status: res.status, headers: outHeaders });
}

// Handler
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
export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
