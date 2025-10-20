import Link from "next/link";

export default function Page() {
  return (
    <main>
      <h1>Times MVP</h1>
      <ul>
        <li><Link href="/login">Login</Link></li>
        <li><Link href="/app">App (Mitarbeiter)</Link></li>
        <li><Link href="/change-password">Passwort ändern</Link></li>
        <li><Link href="/hr">HR</Link> (nur Reviewer/Admin)</li>
        <li><Link href="/review">Review</Link> (nur Reviewer/Admin)</li>
      </ul>
    </main>
  );
}
