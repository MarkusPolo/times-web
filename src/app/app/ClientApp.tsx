"use client";

import { useEffect, useRef, useState } from "react";
import PouchDB from "pouchdb-browser";
import { DateTime } from "luxon";
import AuthGuard from "@/src/components/AuthGuard";
import TimesForm from "@/src/components/TimesForm";

type Entry = {
  _id?: string;
  _rev?: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  intervals: { start: string; end: string; note?: string }[];
  updatedAt: string;
};

type MeResponse = {
  authenticated: boolean;
  user?: { sub: string; role: "employee" | "reviewer" | "admin"; email: string };
};

export default function ClientApp() {
  const [docs, setDocs] = useState<Entry[]>([]);
  const [status, setStatus] = useState<string>("init");
  const [me, setMe] = useState<MeResponse["user"] | null>(null);

  const localDbRef = useRef<PouchDB.Database<Entry> | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 1) Token aus localStorage (für Bearer -> Proxy)
    tokenRef.current = localStorage.getItem("access_token");

    // 2) Userdaten holen (für employeeId)
    (async () => {
      const r = await fetch("/api/auth/me");
      if (r.ok) {
        const j = (await r.json()) as MeResponse;
        if (!cancelled) setMe(j.user ?? null);
      } else {
        if (!cancelled) setMe(null);
      }
    })();

    // 3) Lokale DB öffnen
    const localDb = new PouchDB<Entry>("times_local");
    localDbRef.current = localDb;

    // 4) Startbestand laden
    localDb
      .allDocs({ include_docs: true })
      .then((res) => {
        if (cancelled) return;
        setDocs(res.rows.map((r) => r.doc!) as Entry[]);
      })
      .catch((e) => {
        console.error("[Pouch] allDocs error:", e);
      });

    // 5) Live-Changes
    const changes = localDb
      .changes({ since: "now", live: true, include_docs: true })
      .on("change", (c) => {
        const d = c.doc as Entry;
        setDocs((prev) => {
          const i = prev.findIndex((x) => x._id === d._id);
          if (i >= 0) {
            const cp = prev.slice();
            cp[i] = d;
            return cp;
          }
          return [d, ...prev];
        });
      })
      .on("error", (e) => {
        console.error("[Pouch] changes error:", e);
      });

    // 6) Replikation starten (absolute URL!)
    let cancelSync: (() => void) | null = null;
    const token = tokenRef.current;

    if (token) {
      const remoteUrl = `${window.location.origin}/api/couchdb/times`;

      const fetchWithBearer: typeof fetch = async (url, opts) => {
        const h = new Headers(opts?.headers || {});
        h.set("authorization", `Bearer ${token}`);
        return fetch(url, { ...opts, headers: h });
      };

      // @ts-ignore: PouchDB erlaubt fetch-Override
      const remote = new PouchDB<Entry>(remoteUrl, { fetch: fetchWithBearer });

      const sync = PouchDB.sync(localDb, remote, { live: true, retry: true })
        .on("change", (info) => {
          setStatus("syncing");
          // Debug-Ausgabe hilft bei Problemen
          console.debug("[Pouch] change", info);
        })
        .on("paused", (err) => {
          setStatus("paused");
          if (err) console.warn("[Pouch] paused with error:", err);
        })
        .on("active", () => {
          setStatus("active");
        })
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
            {docs
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((d) => (
                <tr key={d._id}>
                  <td style={{ padding: "4px 0" }}>{d.date}</td>
                  <td>{d.intervals[0]?.start}</td>
                  <td>{d.intervals[0]?.end}</td>
                  <td>{d.intervals[0]?.note || ""}</td>
                  <td>{DateTime.fromISO(d.updatedAt).toFormat("dd.LL.yyyy HH:mm")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </main>
    </AuthGuard>
  );
}
