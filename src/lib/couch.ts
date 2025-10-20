// src/lib/couch.ts
const couchUrl = process.env.COUCHDB_URL!;
const adminUser = process.env.COUCHDB_ADMIN_USER!;
const adminPass = process.env.COUCHDB_ADMIN_PASS!;

export const dbTimes = process.env.COUCHDB_DB_TIMES || "times";
export const dbUsers = process.env.COUCHDB_DB_USERS || "users";
export const dbAudit = process.env.COUCHDB_DB_AUDIT || "audit";

if (!couchUrl || !adminUser || !adminPass) throw new Error("CouchDB env missing");

const basic = "Basic " + Buffer.from(`${adminUser}:${adminPass}`).toString("base64");

async function couchFetch(path: string, init?: RequestInit) {
  const url = `${couchUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: basic,
      ...(init?.headers || {})
    }
  });
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    const err: any = new Error(body?.reason || res.statusText);
    err.status = res.status;
    err.body = body;
    err.url = url;
    throw err;
  }
  if (res.status !== 204) return res.json();
  return null;
}

export async function ensureDbs() {
  const dbs: string[] = await couchFetch("/_all_dbs");
  for (const name of [dbTimes, dbUsers, dbAudit]) {
    if (!dbs.includes(name)) {
      await couchFetch(`/${encodeURIComponent(name)}`, { method: "PUT" });
    }
  }
  await ensureIndexes();
}

async function ensureIndexes() {
  // users: email
  await couchFetch(`/${encodeURIComponent(dbUsers)}/_index`, {
    method: "POST",
    body: JSON.stringify({
      index: { fields: ["email"] },
      name: "idx_users_email",
      type: "json"
    })
  }).catch(() => {});

  // times: date
  await couchFetch(`/${encodeURIComponent(dbTimes)}/_index`, {
    method: "POST",
    body: JSON.stringify({
      index: { fields: ["date"] },
      name: "idx_times_date",
      type: "json"
    })
  }).catch(() => {});

  // times: employeeId
  await couchFetch(`/${encodeURIComponent(dbTimes)}/_index`, {
    method: "POST",
    body: JSON.stringify({
      index: { fields: ["employeeId"] },
      name: "idx_times_employeeId",
      type: "json"
    })
  }).catch(() => {});

  // audit: ts
  await couchFetch(`/${encodeURIComponent(dbAudit)}/_index`, {
    method: "POST",
    body: JSON.stringify({
      index: { fields: ["ts"] },
      name: "idx_audit_ts",
      type: "json"
    })
  }).catch(() => {});
}

// ---------- Users ----------
export type FindResult<T> = { docs: (T & { _id: string; _rev: string })[] };

export async function usersFindByEmail<T = any>(email: string): Promise<FindResult<T>> {
  return couchFetch(`/${encodeURIComponent(dbUsers)}/_find`, {
    method: "POST",
    body: JSON.stringify({ selector: { email }, limit: 1 })
  });
}

export async function usersInsert<T = any>(doc: T) {
  return couchFetch(`/${encodeURIComponent(dbUsers)}`, {
    method: "POST",
    body: JSON.stringify(doc)
  });
}

export async function usersAll<T = any>(limit = 500): Promise<FindResult<T>> {
  return couchFetch(`/${encodeURIComponent(dbUsers)}/_find`, {
    method: "POST",
    body: JSON.stringify({ selector: {}, limit, sort: [{ email: "asc" }] })
  });
}

export async function usersUpdate<T = any>(id: string, rev: string, patch: Partial<T>) {
  const doc = await couchFetch(`/${encodeURIComponent(dbUsers)}/${encodeURIComponent(id)}`);
  const merged = { ...doc, ...patch, _rev: doc._rev };
  return couchFetch(`/${encodeURIComponent(dbUsers)}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(merged)
  });
}

// ---------- Times ----------
export async function timesFind<T = any>(selector: any, limit = 2000): Promise<FindResult<T>> {
  return couchFetch(`/${encodeURIComponent(dbTimes)}/_find`, {
    method: "POST",
    body: JSON.stringify({ selector, limit, sort: [{ date: "desc" }] })
  });
}

export async function timesGet<T = any>(id: string): Promise<T & { _id: string; _rev: string }> {
  return couchFetch(`/${encodeURIComponent(dbTimes)}/${encodeURIComponent(id)}`);
}

export async function timesUpdate<T = any>(id: string, patch: Partial<T>) {
  const doc = await timesGet<T & { _rev: string }>(id);
  const merged = { ...doc, ...patch, _rev: doc._rev };
  return couchFetch(`/${encodeURIComponent(dbTimes)}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(merged)
  });
}

export async function timesInsert<T = any>(doc: T) {
  return couchFetch(`/${encodeURIComponent(dbTimes)}`, {
    method: "POST",
    body: JSON.stringify(doc)
  });
}

// ---------- Audit ----------
export async function auditInsert<T = any>(doc: T) {
  return couchFetch(`/${encodeURIComponent(dbAudit)}`, {
    method: "POST",
    body: JSON.stringify(doc)
  });
}

export async function auditList<T = any>(limit = 200): Promise<FindResult<T>> {
  return couchFetch(`/${encodeURIComponent(dbAudit)}/_find`, {
    method: "POST",
    body: JSON.stringify({ selector: {}, limit, sort: [{ ts: "desc" }] })
  });
}
