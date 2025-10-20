"use client";

import { useForm } from "react-hook-form";
import { useState } from "react";

type Form = { email: string; password: string };

export default function LoginPage() {
  const { register, handleSubmit } = useForm<Form>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (data: Form) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
        credentials: "same-origin"
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error || "Login fehlgeschlagen");
        return;
      }

      if (j?.token) {
        // Nur für Proxy-Bearer (MVP); später entfernen
        localStorage.setItem("access_token", j.token);
        document.cookie = `access_token_public=${j.token}; Path=/; Max-Age=900; SameSite=Lax`;
      }

      window.location.href = "/app";
    } catch (e) {
      setError("Netzwerkfehler");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>Login</h1>
      {/* Hart: method="post" verhindert GET-Query selbst bei fehlender Hydration */}
      <form
        method="post"
        action="#"
        onSubmit={(e) => {
          e.preventDefault(); // Doppelt hält besser
          void handleSubmit(onSubmit)(e);
        }}
        noValidate
        style={{ display: "grid", gap: 8, maxWidth: 360 }}
      >
        <input
          placeholder="E-Mail"
          type="email"
          autoComplete="username"
          {...register("email", { required: true })}
        />
        <input
          placeholder="Passwort"
          type="password"
          autoComplete="current-password"
          {...register("password", { required: true, minLength: 8 })}
        />
        <button type="submit" disabled={busy}>{busy ? "…" : "Einloggen"}</button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p>
        Noch kein Konto? <a href="/register">Registrieren</a>
      </p>
    </main>
  );
}
