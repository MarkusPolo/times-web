"use client";

import { useEffect, useMemo, useState } from "react";
import RoleGuard from "@/src/components/RoleGuard";
import * as XLSX from "xlsx";

type Interval = { start: string; end: string; note?: string };
type Entry = {
  _id: string;
  employeeId: string;
  date: string;
  intervals: Interval[];
  updatedAt: string;
};
type User = { id: string; email: string; role: "employee" | "reviewer" | "admin"; mustChangePassword?: boolean };

export default function ReviewPage() {
  return (
    <RoleGuard allow={["reviewer", "admin"]}>
      <Client />
    </RoleGuard>
  );
}

function Client() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [rows, setRows] = useState<Entry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/hr/users");
      if (!r.ok) return;
      const j = await r.json();
      setUsers(j.users || []);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (employeeId) params.set("employeeId", employeeId);
    const r = await fetch(`/api/review/times?${params.toString()}`);
    const j = await r.json();
    setRows(j.docs || []);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of rows) {
      const key = `${e.employeeId}__${e.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    const out: { key: string; employeeId: string; date: string; entries: Entry[] }[] = [];
    for (const [k, v] of map.entries()) {
      const [emp, d] = k.split("__");
      out.push({ key: k, employeeId: emp, date: d, entries: v });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
  }, [rows]);

  function intervalMinutes(i: Interval) {
    const [sh, sm] = i.start.split(":").map((n) => parseInt(n, 10));
    const [eh, em] = i.end.split(":").map((n) => parseInt(n, 10));
    const delta = (eh * 60 + em) - (sh * 60 + sm);
    return delta < 0 ? delta + 24 * 60 : delta; // über Mitternacht (MVP)
  }
  function entryMinutes(e: Entry) {
    return e.intervals.reduce((sum, i) => sum + Math.max(0, intervalMinutes(i)), 0);
  }
  const totals = useMemo(() => {
    const dayTotals = new Map<string, number>();
    const userTotals = new Map<string, number>();
    for (const g of grouped) {
      const minutes = g.entries.reduce((s, e) => s + entryMinutes(e), 0);
      dayTotals.set(g.date, (dayTotals.get(g.date) || 0) + minutes);
      userTotals.set(g.employeeId, (userTotals.get(g.employeeId) || 0) + minutes);
    }
    const monthTotals = new Map<string, number>();
    for (const [d, min] of dayTotals) {
      const m = d.slice(0, 7);
      monthTotals.set(m, (monthTotals.get(m) || 0) + min);
    }
    const weekTotals = new Map<string, number>();
    for (const [d, min] of dayTotals) {
      const kw = isoWeekKey(d);
      weekTotals.set(kw, (weekTotals.get(kw) || 0) + min);
    }
    return { dayTotals, weekTotals, monthTotals, userTotals };
  }, [grouped]);

  function isoWeekKey(yyyyMmDd: string) {
    const [y, m, d] = yyyyMmDd.split("-").map((n) => parseInt(n, 10));
    const date = new Date(Date.UTC(y, m - 1, d));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }
  function minToHours(m: number) {
    return (m / 60).toFixed(2);
  }

  function exportCSV() {
    const rowsForCsv: string[][] = [["employee", "email", "date", "intervals", "minutes"]];
    for (const g of grouped) {
      for (const e of g.entries) {
        const email = userLabel(users, e.employeeId);
        const intervals = e.intervals.map((i) => `${i.start}-${i.end}${i.note ? ` (${i.note})` : ""}`).join(", ");
        rowsForCsv.push([e.employeeId, email, e.date, intervals, String(entryMinutes(e))]);
      }
    }
    const csv = rowsForCsv.map((r) => r.map((x) => `"${(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `times_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportXLSX() {
    const data = grouped.flatMap((g) =>
      g.entries.map((e) => ({
        employeeId: e.employeeId,
        email: userLabel(users, e.employeeId),
        date: e.date,
        intervals: e.intervals.map((i) => `${i.start}-${i.end}${i.note ? ` (${i.note})` : ""}`).join(", "),
        minutes: entryMinutes(e)
      }))
    );
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "times");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `times_export_${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main>
      <h1>Review – Arbeitszeiten</h1>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto auto", gap: 8, alignItems: "end", margin: "16px 0" }}>
        <label>
          Von
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Bis
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          Mitarbeiter
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Alle</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email} ({u.role})
              </option>
            ))}
          </select>
        </label>
        <button onClick={load} disabled={loading}>
          {loading ? "Laden…" : "Filtern"}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportCSV}>CSV</button>
          <button onClick={exportXLSX}>Excel</button>
        </div>
      </section>

      <Summen totals={totals} users={users} />

      <section>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Mitarbeiter</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Datum</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Blöcke</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Minuten</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => {
              const flat = g.entries;
              const blocks = flat
                .flatMap((e) => e.intervals.map((i) => `${i.start}–${i.end}${i.note ? ` (${i.note})` : ""}`))
                .join(", ");
              const minutes = flat.reduce((s, e) => {
                return s + e.intervals.reduce((sum, i) => sum + Math.max(0, intervalMinutes(i)), 0);
              }, 0);
              return (
                <tr key={g.key}>
                  <td style={{ padding: "6px 0" }}>{userLabel(users, g.employeeId)}</td>
                  <td>{g.date}</td>
                  <td>{blocks}</td>
                  <td>{minutes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {grouped.length === 0 && <p>Keine Einträge gefunden.</p>}
      </section>
    </main>
  );
}

function userLabel(users: User[], id: string) {
  const u = users.find((x) => x.id === id);
  return u ? `${u.email}` : id;
}

function Summen({
  totals,
  users
}: {
  totals: {
    dayTotals: Map<string, number>;
    weekTotals: Map<string, number>;
    monthTotals: Map<string, number>;
    userTotals: Map<string, number>;
  };
  users: User[];
}) {
  const minToHours = (m: number) => (m / 60).toFixed(2);
  return (
    <section style={{ margin: "12px 0" }}>
      <h3>Summen</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
        <div>
          <strong>Pro Tag</strong>
          <ul>
            {Array.from(totals.dayTotals.entries())
              .sort(([a], [b]) => (a < b ? 1 : -1))
              .slice(0, 20)
              .map(([d, m]) => (
                <li key={d}>{d}: {minToHours(m)} h</li>
              ))}
          </ul>
        </div>
        <div>
          <strong>Pro Woche (ISO)</strong>
          <ul>
            {Array.from(totals.weekTotals.entries())
              .sort(([a], [b]) => (a < b ? 1 : -1))
              .slice(0, 12)
              .map(([w, m]) => (
                <li key={w}>{w}: {minToHours(m)} h</li>
              ))}
          </ul>
        </div>
        <div>
          <strong>Pro Monat</strong>
          <ul>
            {Array.from(totals.monthTotals.entries())
              .sort(([a], [b]) => (a < b ? 1 : -1))
              .slice(0, 12)
              .map(([mo, m]) => (
                <li key={mo}>{mo}: {minToHours(m)} h</li>
              ))}
          </ul>
        </div>
        <div>
          <strong>Pro Mitarbeiter</strong>
          <ul>
            {Array.from(totals.userTotals.entries())
              .sort(([a], [b]) => (a < b ? 1 : -1))
              .map(([emp, m]) => (
                <li key={emp}>{userLabel(users, emp)}: {minToHours(m)} h</li>
              ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
