"use client";

import { useEffect, useRef, useState } from "react";
import PouchDB from "pouchdb-browser";
import { DateTime } from "luxon";
import AuthGuard from "@/src/components/AuthGuard";
import TimesForm from "@/src/components/TimesForm";
import LogoutButton from "@/src/components/LogoutButton";

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

  const [edit, setEdit] = useState<null | Entry>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const localDbRef = useRef<PouchDB.Database<Entry> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const syncCancelRef = useRef<(() => void) | null>(null);

  // Refresh-Entzerrung (verhindert Doppelaufrufe während Rotation)
  const refreshLockRef = useRef(false);
  const lastRefreshOkAtRef = useRef<number>(0);

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
      return false;
    } catch {
      return false;
    } finally {
      refreshLockRef.current = false;
    }
  }

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Initial versuchen, Access zu holen (via Refresh)
      await refreshAccessToken();

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
        .on("error", (e) => console.error("[Pouch] changes error:", e));

      // 6) Sync nur starten, wenn bereits ein Token da ist
      if (tokenRef.current) startSync();

      // 7) regelmäßiger Refresh (alle 10 Minuten)
      const iv = setInterval(() => {
        // Wenn kurz zuvor schon erfolgreich refresht wurde, nicht spammen
        if (Date.now() - lastRefreshOkAtRef.current < 3000) return;
        void refreshAccessToken();
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
    setOkMsg("Eintrag hinzugefügt.");
    setTimeout(() => setOkMsg(null), 2000);
  };

  const beginEdit = (d: Entry) => {
    setErrMsg(null);
    setOkMsg(null);
    setEdit(d);
  };

  const saveEdit = async (payload: { start: string; end: string; note?: string }) => {
    if (!localDbRef.current || !edit?._id || !edit._rev) return;
    try {
      setErrMsg(null);
      const next: Entry = {
        ...edit,
        intervals: [{ start: payload.start, end: payload.end, note: payload.note }],
        updatedAt: new Date().toISOString()
      };
      const res = await localDbRef.current.put(next);

      // Erfolgsfeedback: Edit schließen + kurze Meldung
      setEdit(null);
      setOkMsg("Änderungen gespeichert.");
      setTimeout(() => setOkMsg(null), 2000);

      // Optimistisch _rev aktualisieren, falls Doc gerade in State steckt
      setDocs((prev) => prev.map((d) => (d._id === next._id ? { ...next, _rev: res.rev } : d)));
    } catch (e: any) {
      if (e?.status === 409) {
        setErrMsg("Konflikt: Die Version ist veraltet. Bitte Ansicht aktualisieren.");
        setStatus("conflict");
      } else {
        setErrMsg("Speichern fehlgeschlagen.");
      }
    }
  };

  const cancelEdit = () => setEdit(null);

  const removeEntry = async (d: Entry) => {
    if (!localDbRef.current || !d._id || !d._rev) return;
    try {
      await localDbRef.current.remove({ _id: d._id, _rev: d._rev });
      if (edit?._id === d._id) setEdit(null);
      setOkMsg("Eintrag gelöscht.");
      setTimeout(() => setOkMsg(null), 2000);
    } catch {
      setErrMsg("Löschen fehlgeschlagen.");
    }
  };

  return (
    <AuthGuard>
      <main>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Meine Zeiten</h1>
          <LogoutButton />
        </header>

        <p>Status: {status}</p>
        {okMsg && <p style={{ color: "green" }}>{okMsg}</p>}
        {errMsg && <p style={{ color: "crimson" }}>{errMsg}</p>}

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
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Aktionen</th>
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
                  <td>
                    {!isEditing ? (
                      <>
                        <button onClick={() => beginEdit(d)} style={{ marginRight: 6 }}>
                          Bearbeiten
                        </button>
                        <button onClick={() => removeEntry(d)}>Löschen</button>
                      </>
                    ) : (
                      <span style={{ color: "#888" }}>Wird unten bearbeitet…</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {edit && (
          <section style={{ marginTop: 16, padding: 12, border: "1px solid #ddd" }}>
            <h3>Eintrag bearbeiten</h3>
            <EditForm
              initial={edit.intervals?.[0] ?? { start: "", end: "", note: "" }}
              onSave={saveEdit}
              onCancel={cancelEdit}
            />
          </section>
        )}
      </main>
    </AuthGuard>
  );
}

// Kleine Inline-Edit-Form
function EditForm({
  initial,
  onSave,
  onCancel
}: {
  initial: { start: string; end: string; note?: string };
  onSave: (p: { start: string; end: string; note?: string }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [note, setNote] = useState(initial.note || "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ start, end, note });
      }}
      style={{ display: "grid", gap: 8, maxWidth: 400 }}
    >
      <input aria-label="Start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      <input aria-label="Ende" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      <input aria-label="Notiz" placeholder="Notiz" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit">Speichern</button>
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
