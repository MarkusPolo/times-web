import Link from "next/link";

export default function Page() {
  return (
    <main>
      <h1>Times MVP</h1>
      <p>Bitte einloggen oder registrieren.</p>
      <p>
        <Link href="/login">Login</Link> &nbsp;|&nbsp; <Link href="/register">Registrieren</Link>
      </p>
    </main>
  );
}
