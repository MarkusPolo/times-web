// src/app/api/couchdb/[...path]/route.ts
// Reverse-Proxy für PouchDB-Sync auf DB "times" mit Mandanten-Isolation.
// - prüft Bearer (JWT)
// - spricht CouchDB mit Basic (Admin)
// - ROLE employee: nur eigene Docs (entry:<sub>:...), _changes/_find werden serverseitig gefiltert
// - reviewer/admin: durchgelassen (Review geschieht über /api/review/*)
// - Audit nur für fachliche Writes (PUT/DELETE und Bulk time_entry)

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/src/lib/jwt";
import { auditInsert } from "@/src/lib/couch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const couchUrl = process.env.COUCHDB_URL!;
const adminUser = process.env.COUCHDB_ADMIN_USER!;
const adminPass = process.env.COUCHDB_ADMIN_PASS!;

type Role = "employee" | "reviewer" | "admin";

function unauthorized(msg = "unauthorized") {
  return NextResponse.json({ error: "unauthorized", reason: msg }, { status: 401 });
}
function forbidden(msg = "forbidden") {
  return NextResponse.json({ error: "forbidden", reason: msg }, { status: 403 });
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

function dbNameFromPath(parts: string[]) {
  return parts[0] || "";
}
function isTimesDbPath(parts: string[]) {
  return dbNameFromPath(parts) === "times";
}
function docIdFromPath(parts: string[]) {
  return parts[1] || "";
}
function isWriteMethod(m: string) {
  return m === "POST" || m === "PUT" || m === "DELETE";
}
function isReplicationNoise(parts: string[]) {
  const p1 = parts[1];
  return p1 === "_revs_diff" || p1 === "_changes" || p1 === "_bulk_get" || p1 === "_design" || p1 === "_local";
}
function isBulkDocs(parts: string[]) {
  return parts[1] === "_bulk_docs";
}
function isAllDocs(parts: string[]) {
  return parts[1] === "_all_docs";
}
function idIsOwnedBySub(id: string, sub: string) {
  return id.startsWith(`entry:${sub}:`);
}
async function parseJson(ab: ArrayBuffer | null) {
  if (!ab) return null;
  try {
    const txt = new TextDecoder().decode(ab);
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
function buildUrl(base: string, parts: string[], req: NextRequest) {
  const path = parts.join("/");
  const u = new URL(`${base}/${path}`);
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    u.searchParams.set(k, v);
  }
  return u;
}

async function maybeAuditTimesWrite(opts: {
  method: string;
  parts: string[];
  status: number;
  actorId?: string;
  actorEmail?: string;
  reqBodyJson: any | null;
}) {
  const { method, parts, status, actorEmail, actorId, reqBodyJson } = opts;
  if (!isWriteMethod(method)) return;
  if (!isTimesDbPath(parts)) return;
  if (isReplicationNoise(parts)) return;

  if (isBulkDocs(parts)) {
    const docs = Array.isArray(reqBodyJson?.docs) ? reqBodyJson.docs : [];
    const entries = docs.filter((d: any) => d && d.type === "time_entry");
    if (!entries.length) return;
    const ids = entries.map((d: any) => d._id).filter(Boolean);
    await auditInsert({
      ts: new Date().toISOString(),
      type: "times_write",
      actorId,
      actorEmail,
      meta: { method, path: "/times/_bulk_docs", status, count: entries.length, ids: ids.slice(0, 10) }
    });
    return;
  }

  const docId = docIdFromPath(parts);
  if (method === "PUT" && docId && !docId.startsWith("_")) {
    if (reqBodyJson?.type === "time_entry") {
      await auditInsert({
        ts: new Date().toISOString(),
        type: "times_write",
        actorId,
        actorEmail,
        meta: { method, path: `/times/${docId}`, status, id: docId }
      });
    }
    return;
  }

  if (method === "DELETE" && docId && !docId.startsWith("_")) {
    await auditInsert({
      ts: new Date().toISOString(),
      type: "times_delete",
      actorId,
      actorEmail,
      meta: { method, path: `/times/${docId}`, status, id: docId }
    });
  }
}

async function forward(req: NextRequest, ctx: { params: { path: string[] } }) {
  // 1) Bearer prüfen
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!bearer) return unauthorized("missing bearer");

  let sub = "";
  let email = "";
  let role: Role = "employee";
  try {
    const p = verifyAccessToken(bearer);
    sub = (p as any).sub;
    email = (p as any).email;
    role = (p as any).role as Role;
  } catch {
    return unauthorized("invalid token");
  }

  const parts = ctx.params.path;
  const method = req.method.toUpperCase();

  // 2) Nur DB "times" erlauben
  if (!isTimesDbPath(parts)) return forbidden("db not allowed");

  // 3) ROLE employee → Isolation erzwingen
  const isEmployee = role === "employee";
  const url = buildUrl(couchUrl, parts, req);

  // a) _all_docs mit include_docs blocken
  if (isAllDocs(parts)) {
    return forbidden("all_docs not allowed");
  }

  // b) _changes → serverseitiger selector
  if (parts[1] === "_changes" && isEmployee) {
    url.searchParams.set("filter", "_selector");
    url.searchParams.set("selector", JSON.stringify({ employeeId: sub }));
  }

  // c) _find → selector um employeeId ergänzen/setzen
  if (parts[1] === "_find" && isEmployee) {
    const ab = !["GET", "HEAD"].includes(method) ? await req.arrayBuffer() : null;
    const bodyJson = await parseJson(ab);
    const sel = bodyJson?.selector && typeof bodyJson.selector === "object" ? bodyJson.selector : {};
    const merged = { ...sel, employeeId: sub };
    const newBody = JSON.stringify({ ...bodyJson, selector: merged });
    const headers = sanitizeHeaders(req);
    headers.set("content-type", "application/json");

    const res = await fetch(url.toString(), { method, headers, body: newBody, redirect: "manual" });
    const out = new Headers(res.headers);
    out.delete("transfer-encoding");
    out.delete("connection");
    out.set("access-control-expose-headers", "*");
    return new NextResponse(res.body, { status: res.status, headers: out });
  }

  // d) Einzel-Dokumente nur bei eigener ID
  const singleDocId = docIdFromPath(parts);
  if (singleDocId && !singleDocId.startsWith("_") && isEmployee) {
    if (!idIsOwnedBySub(singleDocId, sub)) {
      return forbidden("document not owned by user");
    }
  }

  // e) Writes validieren (Bulk & Einzel)
  let bodyAb: ArrayBuffer | null = null;
  if (!["GET", "HEAD"].includes(method)) {
    bodyAb = await req.arrayBuffer();
  }
  const bodyJson = await parseJson(bodyAb);

  if (isEmployee && isWriteMethod(method)) {
    if (isBulkDocs(parts)) {
      const docs = Array.isArray(bodyJson?.docs) ? bodyJson.docs : [];
      for (const d of docs) {
        const id = d?._id || "";
        const emp = d?.employeeId || "";
        if (!idIsOwnedBySub(id, sub) || emp !== sub) {
          return forbidden("bulk contains foreign document");
        }
      }
    }
    if (method === "PUT" && singleDocId && !singleDocId.startsWith("_")) {
      const okId = idIsOwnedBySub(singleDocId, sub);
      const okEmp = bodyJson?.employeeId === sub;
      if (!okId || !okEmp) return forbidden("foreign document write");
    }
  }

  // 4) Forward
  const headers = sanitizeHeaders(req);
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: bodyAb || undefined,
    redirect: "manual"
  });

  // 5) Antwort säubern
  const outHeaders = new Headers(res.headers);
  outHeaders.delete("transfer-encoding");
  outHeaders.delete("connection");
  outHeaders.set("access-control-expose-headers", "*");

  // 6) Audit
  try {
    await maybeAuditTimesWrite({
      method,
      parts,
      status: res.status,
      actorEmail: email,
      actorId: sub,
      reqBodyJson: bodyJson
    });
  } catch (e) {
    console.warn("[proxy/audit] skipped due to error:", e);
  }

  return new NextResponse(res.body, { status: res.status, headers: outHeaders });
}

// HTTP-Methoden
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
