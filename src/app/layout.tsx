import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Times MVP",
  description: "Offline-first Arbeitszeiterfassung"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, Segoe UI, Roboto, sans-serif", margin: 0 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px" }}>{children}</div>
      </body>
    </html>
  );
}
