"use client";

import { useEffect, useState } from "react";
import RoleGuard from "@/src/components/RoleGuard";

type User = { id: string; email: string; role: "employee" | "reviewer" | "admin"; mustChangePassword?: boolean };

export default function HRPage() {
  return (
    <RoleGuard allow={["reviewer", "admin"]}>
      <Client />
    </RoleGuard>
  );
}

function Client() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"employee" | "reviewer" | "admin">("employee");
  const [tempPassword, setTempPassword] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const r = await fetch("/api/hr/users");
    if (!r.ok) return;
    const j = await r.json();
    setUsers(j.users || []);
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async () => {
    setCreating(true);
    setMsg(null);
    const r = await fetch("/api/hr/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role, tempPassword: tempPassword || undefined })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(j.error || "Fehler beim Anlegen");
    } else {
      setMsg(`Angelegt: ${j.user.email} – Temp-Passwort: ${j.user.tempPassword}`);
      setEmail("");
      setTempPassword("");
      await load();
    }
    setCreating(false);
  };

  return (
    <main>
      <h1>HR – Mitarbeiter anlegen</h1>

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 8, alignItems: "end", margin: "16px 0" }}>
        <label>
          E-Mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
        </label>
        <label>
          Rolle
          <select value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="employee">employee</option>
            <option value="reviewer">reviewer</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label>
          Temp-Passwort (optional)
          <input type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="min. 8 Zeichen" />
        </label>
        <button onClick={createUser} disabled={creating || !email}>
          {creating ? "Anlegen…" : "Anlegen"}
        </button>
      </section>

      {msg && <p style={{ color: "#0a0" }}>{msg}</p>}

      <h2>Benutzer</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>E-Mail</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Rolle</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>Passwortwechsel nötig</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={{ padding: "6px 0" }}>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.mustChangePassword ? "Ja" : "Nein"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
