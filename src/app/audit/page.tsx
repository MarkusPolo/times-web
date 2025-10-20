"use client";

import { useEffect, useState } from "react";
import RoleGuard from "@/src/components/RoleGuard";

type Event = {
  _id: string;
  ts: string;
  type: string;
  actorId?: string;
  actorEmail?: string;
  meta?: Record<string, any>;
};

export default function AuditPage() {
  return (
    <RoleGuard allow={["reviewer", "admin"]}>
      <Client />
    </RoleGuard>
  );
}

function Client() {
  const [rows, setRows] = useState<Event[]>([]);
  const [limit, setLimit] = useState(200);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const r = await fetch(`/api/audit?limit=${limit}`);
    const j = await r.json();
    setRows(j.docs || []);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <h1>Audit-Log</h1>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
        <label>
          Limit
          <input type="number" value={limit} min={1} max={2000} onChange={(e) => setLimit(parseInt(e.target.value, 10))} />
        </label>
        <button onClick={load} disabled={loading}>{loading ? "Laden…" : "Neu laden"}</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Zeit</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Typ</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Akteur</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Meta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e._id}>
              <td>{new Date(e.ts).toLocaleString()}</td>
              <td>{e.type}</td>
              <td>{e.actorEmail || e.actorId || "-"}</td>
              <td><code style={{ fontSize: 12 }}>{JSON.stringify(e.meta || {}, null, 0)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>Keine Einträge.</p>}
    </main>
  );
}
