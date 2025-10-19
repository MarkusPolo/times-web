"use client";

import { useForm } from "react-hook-form";
import { useState } from "react";

type Form = { email: string; password: string };

export default function RegisterPage() {
  const { register, handleSubmit } = useForm<Form>();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (data: Form) => {
    setError(null);
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...data })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.error || "Registrierung fehlgeschlagen");
      return;
    }

    if (j?.token) {
      localStorage.setItem("access_token", j.token);
      document.cookie = `access_token_public=${j.token}; Path=/; Max-Age=900; SameSite=Lax`;
    }

    window.location.href = "/app";
  };

  return (
    <main>
      <h1>Registrieren</h1>
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
        <input placeholder="E-Mail" type="email" {...register("email", { required: true })} />
        <input placeholder="Passwort" type="password" {...register("password", { required: true, minLength: 8 })} />
        <button type="submit">Konto anlegen</button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p>
        Bereits ein Konto? <a href="/login">Login</a>
      </p>
    </main>
  );
}
