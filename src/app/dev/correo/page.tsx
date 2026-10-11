import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { readDevOutbox } from "@/server/email";

export const metadata = { title: "Buzón de desarrollo" };

/** Buzon local: muestra los correos que en produccion se enviarian. */
export default function DevMailboxPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="font-heading text-3xl font-extrabold">📬 Buzón de desarrollo</h1>
      <p className="mt-2 text-muted-foreground">
        Solo existe en local. Aquí llegan los correos de verificación y de recuperación de contraseña.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted-foreground">Cargando…</p>}>
        <Mailbox />
      </Suspense>
    </main>
  );
}

async function Mailbox() {
  await connection();
  if (process.env.NODE_ENV === "production") notFound();
  const emails = await readDevOutbox();
  if (!emails.length) return <p className="mt-8 text-muted-foreground">Aún no hay correos.</p>;
  return (
    <ul className="mt-8 space-y-4">
      {emails.map((m) => (
        <li key={m.id} className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted-foreground">
            {new Date(m.createdAt).toLocaleString("es")} · para <strong>{m.to}</strong>
          </p>
          <p className="mt-1 font-semibold">{m.subject}</p>
          <p className="mt-2 text-sm text-muted-foreground">{m.text}</p>
          {m.actionUrl && (
            <a
              href={m.actionUrl}
              className="mt-3 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Abrir enlace
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
