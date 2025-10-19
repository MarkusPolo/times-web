"use client";

import { useForm } from "react-hook-form";
import { useState } from "react";

type Form = { email: string; password: string };

export default function LoginPage() {
  const { register, handleSubmit } = useForm<Form>();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (data: Form) => {
    setError(null);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error || "Login fehlgeschlagen");
      return;
    }

    // Token lokal für PouchDB-Proxy
    if (j?.token) {
      localStorage.setItem("access_token", j.token);
      // Fallback-Cookie für Middleware (15 Minuten)
      document.cookie = `access_token_public=${j.token}; Path=/; Max-Age=900; SameSite=Lax`;
    }

    // Harte Navigation (um Dev-Runtime/Router-Zicken zu vermeiden)
    window.location.href = "/app";
  };

  return (
    <main>
      <h1>Login</h1>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <input placeholder="E-Mail" type="email" {...register("email", { required: true })} />
        <input placeholder="Passwort" type="password" {...register("password", { required: true })} />
        <button type="submit">Einloggen</button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p>
        Noch kein Konto? <a href="/register">Registrieren</a>
      </p>
    </main>
  );
}
