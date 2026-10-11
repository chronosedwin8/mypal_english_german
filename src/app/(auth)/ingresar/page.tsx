import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Ingresar" };

export default function SignInPage() {
  return (
    <>
      <h1 className="font-heading text-3xl font-extrabold tracking-tight">¡Hola de nuevo!</h1>
      <p className="mt-2 text-muted-foreground">Ingresa para seguir practicando con tu tutor.</p>
      <Suspense>
        <SignInForm />
      </Suspense>
    </>
  );
}
