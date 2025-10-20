"use client";

import { useState } from "react";
import AuthGuard from "@/src/components/AuthGuard";

export default function ChangePasswordPage() {
  return (
    <AuthGuard>
      <Client />
    </AuthGuard>
  );
}

function Client() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setMsg(null);
    const r = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(j.error || "Fehler");
    } else {
      setMsg("Passwort aktualisiert.");
      setOldPassword("");
      setNewPassword("");
    }
  };

  return (
    <main>
      <h1>Passwort ändern</h1>
      <div style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <label>
          Altes Passwort
          <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
        </label>
        <label>
          Neues Passwort
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        <button onClick={submit} disabled={!oldPassword || newPassword.length < 8}>
          Aktualisieren
        </button>
        {msg && <p>{msg}</p>}
      </div>
    </main>
  );
}
