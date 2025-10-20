"use client";

export default function LogoutButton() {
  async function onClick() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    // lokale Token für den Pouch-Proxy entfernen
    localStorage.removeItem("access_token");
    // Hart zur Login-Seite
    window.location.href = "/login";
  }

  return (
    <button onClick={onClick} style={{ padding: "6px 10px" }}>
      Logout
    </button>
  );
}
