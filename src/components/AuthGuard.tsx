"use client";

import { useEffect, useState } from "react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<null | boolean>(null);
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/auth/me");
      setOk(r.ok);
    })();
  }, []);
  if (ok === null) return <p>Lade…</p>;
  if (!ok) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  return <>{children}</>;
}
