"use client";

import { useEffect, useState } from "react";

type MeResponse = {
  authenticated: boolean;
  user?: { sub: string; role: "employee" | "reviewer" | "admin"; email: string; mustChangePassword?: boolean };
};

export default function RoleGuard({
  allow,
  children
}: {
  allow: Array<"employee" | "reviewer" | "admin">;
  children: React.ReactNode;
}) {
  const [ok, setOk] = useState<null | boolean>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/auth/me");
      if (!r.ok) {
        setOk(false);
        if (typeof window !== "undefined") window.location.href = "/login";
        return;
      }
      const j = (await r.json()) as MeResponse;

      // Passwortwechsel erzwingen
      if (j.user?.mustChangePassword && typeof window !== "undefined") {
        const path = window.location.pathname;
        if (!path.startsWith("/change-password")) {
          window.location.href = "/change-password";
          return;
        }
      }

      setOk(!!j.user && allow.includes(j.user.role));
    })();
  }, [allow]);

  if (ok === null) return <p>Lade…</p>;
  if (!ok) return <p>Kein Zugriff.</p>;
  return <>{children}</>;
}
