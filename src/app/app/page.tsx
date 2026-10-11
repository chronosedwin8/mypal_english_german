import { Suspense } from "react";

import { requireUser } from "@/server/auth/dal";

import { SignOutButton } from "./sign-out-button";

export const metadata = { title: "Inicio" };

export default function AppHomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
        <Welcome />
      </Suspense>
    </main>
  );
}

async function Welcome() {
  const user = await requireUser("/app");
  return (
    <div className="space-y-4">
      <h1 className="font-heading text-3xl font-extrabold">¡Hola, {user.name}! 👋</h1>
      <p className="text-muted-foreground">Tu cuenta está lista. (Panel en construcción.)</p>
      <SignOutButton />
    </div>
  );
}
