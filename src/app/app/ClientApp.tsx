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
  const syncCancelRef = useRef<(() => void) | null>(null);

  // --- Access-Token via Refresh-Cookie nachladen/erneuern ---
  async function refreshAccessToken() {
    try {
      const r = await fetch("/api/auth/access", { method: "POST" });
      if (!r.ok) return;
      const j = await r.json();
      if (j?.token) {
        tokenRef.current = j.token;
        localStorage.setItem("access_token", j.token); // nur fürs Proxy-Bearer (MVP)

        // Falls bisher kein Sync läuft, jetzt starten
        if (!syncCancelRef.current) {
          startSync();
        }
      }
    } catch {
      // offline/fehler -> ignorieren
    }
  }

  function startSync() {
    if (!localDbRef.current) return;
    if (!tokenRef.current) {
      setStatus("offline (kein Token)");
      return;
    }

    const localDb = localDbRef.current;
    const remoteUrl = `${window.location.origin}/api/couchdb/times`;

    const fetchWithBearer: typeof fetch = async (url, opts) => {
      const h = new Headers(opts?.headers || {});
      const t = tokenRef.current;
      if (t) h.set("authorization", `Bearer ${t}`);
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
      .on("error", async (e: any) => {
        // Viele Fehler sind temporär. Bei 401/403 sofort re-auth versuchen.
        const msg = String(e?.status || e?.statusCode || e?.name || e?.message || "error");
        if (e?.status === 401 || e?.status === 403 || /unauth/i.test(msg)) {
          setStatus("reauth…");
          await refreshAccessToken();
          // kein cancel – der Sync läuft mit retry:true weiter und bekommt dann neues Token
          return;
        }
        setStatus("error");
        console.error("[Pouch] sync error", e);
      });

    syncCancelRef.current = () => {
      // @ts-ignore
      sync.cancel();
      syncCancelRef.current = null;
    };
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Initiales Access-Token holen
      await refreshAccessToken();

      // 2) User laden (für employeeId)
      try {
        const r = await fetch("/api/auth/me");
        if (r.ok) {
          const j = (await r.json()) as MeResponse;
          if (!cancelled) setMe(j.user ?? null);
        } else if (!cancelled) {
          setMe(null);
        }
      } catch {
        if (!cancelled) setMe(null);
      }

      // 3) Lokale DB
      const localDb = new PouchDB<Entry>("times_local");
      localDbRef.current = localDb;

      // 4) Initialbestand (nur gültige time_entry-Dokumente)
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

      // 5) Live-Changes
      const changes = localDb
        .changes({ since: "now", live: true, include_docs: true })
        .on("change", (c) => {
          const d = c.doc as Entry;
          if (!isTimeEntry(d)) return;
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

      // 6) Sync nur starten, wenn bereits ein Token da ist
      if (tokenRef.current) startSync();

      // 7) regelmäßiger Refresh (alle 10 Minuten)
      const iv = setInterval(() => {
        refreshAccessToken();
      }, 10 * 60 * 1000);

      return () => {
        cancelled = true;
        changes.cancel();
        syncCancelRef.current?.();
        clearInterval(iv);
        localDbRef.current = null;
      };
    })();
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
