import dynamic from "next/dynamic";

// WICHTIG: ssr:false, damit keine Server-Seite jemals PouchDB importiert
const ClientApp = dynamic(() => import("./ClientApp"), { ssr: false });

export default function Page() {
  return <ClientApp />;
}
