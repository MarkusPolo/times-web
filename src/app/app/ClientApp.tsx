"use client";

import { useEffect, useRef, useState } from "react";
import PouchDB from "pouchdb-browser";
import { DateTime } from "luxon";
import AuthGuard from "@/src/components/AuthGuard";
import TimesForm from "@/src/components/TimesForm";

type Interval = { start: string; end: string; note?: string };
type Entry = {
  _id?: string;
  _rev?: string;
  type: "time_entry";
  employeeId: string;
  date: string; // YYYY-MM-DD
  intervals: Interval[];
  updatedAt: string;
};

type MeResponse = {
  authenticated: boolean;
  user?: { sub: string; role: "employee" | "reviewer" | "admin"; email: string };
};

function isTimeEntry(d: any): d is Entry {
  return d && d.type === "time_entry" && Array.isArray(d.intervals) && typeof d.date === "string";
}

export default function ClientApp() {
  const [docs, setDocs] = useState<Entry[]>([]);
  const [status, setStatus] = useState<string>("init");
  const [me, setMe] = useState<MeResponse["user"] | null>(null);

  const localDbRef = useRef<PouchDB.Database<Entry> | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    tokenRef.current = localStorage.getItem("access_token");

    // User laden (für employeeId)
    (async () => {
      const r = await fetch("/api/auth/me");
      if (r.ok) {
        const j = (await r.json()) as MeResponse;
        if (!cancelled) setMe(j.user ?? null);
      } else {
        if (!cancelled) setMe(null);
      }
    })();

    // Lokale DB
    const localDb = new PouchDB<Entry>("times_local");
    localDbRef.current = localDb;

    // Initialbestand
    localDb
      .allDocs({ include_docs: true })
      .then((res) => {
        if (cancelled) return;
        const list = res.rows
          .map((r) => r.doc!)
          .filter(isTimeEntry)
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        setDocs(list);
      })
      .catch((e) => console.error("[Pouch] allDocs error:", e));

    // Live-Changes
    const changes = localDb
      .changes({ since: "now", live: true, include_docs: true })
      .on("change", (c) => {
        const d = c.doc as Entry;
        if (!isTimeEntry(d)) return; // ignorier alte/inkonsistente Docs
        setDocs((prev) => {
          const i = prev.findIndex((x) => x._id === d._id);
          if (i >= 0) {
            const cp = prev.slice();
            cp[i] = d;
            return cp.sort((a, b) => (a.date < b.date ? 1 : -1));
          }
          return [d, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1));
        });
      })
      .on("error", (e) => console.error("[Pouch] changes error:", e));

    // Replikation
    let cancelSync: (() => void) | null = null;
    const token = tokenRef.current;

    if (token) {
      const remoteUrl = `${window.location.origin}/api/couchdb/times`;

      const fetchWithBearer: typeof fetch = async (url, opts) => {
        const h = new Headers(opts?.headers || {});
        h.set("authorization", `Bearer ${token}`);
        return fetch(url, { ...opts, headers: h });
      };

      // @ts-ignore fetch-Override ist in pouchdb-browser erlaubt
      const remote = new PouchDB<Entry>(remoteUrl, { fetch: fetchWithBearer });

      const sync = PouchDB.sync(localDb, remote, { live: true, retry: true })
        .on("change", () => setStatus("syncing"))
        .on("paused", (err) => setStatus(err ? "paused (err)" : "paused"))
        .on("active", () => setStatus("active"))
        .on("denied", (e: any) => {
          setStatus("denied");
          console.error("[Pouch] denied", e);
        })
        .on("error", (e: any) => {
          setStatus("error");
          console.error("[Pouch] sync error", e);
        });

      cancelSync = () => {
        // @ts-ignore
        sync.cancel();
      };
    } else {
      setStatus("offline (kein Token)");
    }

    return () => {
      cancelled = true;
      changes.cancel();
      cancelSync?.();
      localDbRef.current = null;
    };
  }, []);

  const addEntry = async (payload: { date: string; start: string; end: string; note?: string }) => {
    if (!localDbRef.current) return;
    const employeeId = me?.sub || "me";
    const id = `entry:${employeeId}:${payload.date}:${crypto.randomUUID()}`;

    const e: Entry = {
      _id: id,
      type: "time_entry",
      employeeId,
      date: payload.date,
      intervals: [{ start: payload.start, end: payload.end, note: payload.note }],
      updatedAt: new Date().toISOString()
    };
    await localDbRef.current.put(e);
  };

  return (
    <AuthGuard>
      <main>
        <h1>Meine Zeiten</h1>
        <p>Status: {status}</p>
        <TimesForm onAdd={addEntry} />
        <h2>Einträge</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Datum</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Start</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Ende</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Notiz</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Aktualisiert</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const first = d.intervals?.[0] ?? { start: "", end: "", note: "" };
              return (
                <tr key={d._id}>
                  <td style={{ padding: "4px 0" }}>{d.date}</td>
                  <td>{first.start}</td>
                  <td>{first.end}</td>
                  <td>{first.note || ""}</td>
                  <td>{DateTime.fromISO(d.updatedAt).toFormat("dd.LL.yyyy HH:mm")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>
    </AuthGuard>
  );
}
