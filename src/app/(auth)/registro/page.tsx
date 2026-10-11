import type { Metadata } from "next";
import { Suspense } from "react";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">Crea tu cuenta</h1>
      <p className="mt-2 text-muted-foreground">Y recibe 5 minutos gratis con tu tutor por video.</p>
      <Suspense>
        <SignUpForm />
      </Suspense>
    </>
  );
}
