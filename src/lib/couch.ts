const couchUrl = process.env.COUCHDB_URL!;
const adminUser = process.env.COUCHDB_ADMIN_USER!;
const adminPass = process.env.COUCHDB_ADMIN_PASS!;
export const dbTimes = process.env.COUCHDB_DB_TIMES || "times";
export const dbUsers = process.env.COUCHDB_DB_USERS || "users";

if (!couchUrl || !adminUser || !adminPass) throw new Error("CouchDB env missing");

// Basic Auth Header einmal berechnen
const basic = "Basic " + Buffer.from(`${adminUser}:${adminPass}`).toString("base64");

async function couchFetch(path: string, init?: RequestInit) {
  const url = `${couchUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: basic,
      ...(init?.headers || {})
    },
    // kein Proxy, keep it simple
  });
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    const err: any = new Error(body?.reason || res.statusText);
    err.status = res.status;
    err.body = body;
    err.url = url;
    throw err;
  }
  // CouchDB antwortet JSON
  if (res.status !== 204) {
    return res.json();
  }
  return null;
}

export async function ensureDbs() {
  const dbs: string[] = await couchFetch("/_all_dbs");
  for (const name of [dbTimes, dbUsers]) {
    if (!dbs.includes(name)) {
      await couchFetch(`/${encodeURIComponent(name)}`, { method: "PUT" });
    }
  }
}

export type FindResult<T> = { docs: (T & { _id: string; _rev: string })[] };

export async function usersFindByEmail<T = any>(email: string): Promise<FindResult<T>> {
  return couchFetch(`/${encodeURIComponent(dbUsers)}/_find`, {
    method: "POST",
    body: JSON.stringify({
      selector: { email },
      limit: 1
    })
  });
}

export async function usersInsert<T = any>(doc: T) {
  return couchFetch(`/${encodeURIComponent(dbUsers)}`, {
    method: "POST",
    body: JSON.stringify(doc)
  });
}

export async function timesInsert<T = any>(doc: T) {
  return couchFetch(`/${encodeURIComponent(dbTimes)}`, {
    method: "POST",
    body: JSON.stringify(doc)
  });
}
