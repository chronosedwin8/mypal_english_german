import type { Metadata } from "next";
import { Suspense } from "react";

import { ResendVerification } from "./resend-verification";

export const metadata: Metadata = { title: "Confirma tu correo" };

export default function VerifyEmailPage() {
  return (
    <div className="text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-secondary text-3xl">📬</div>
      <h1 className="mt-6 font-heading text-3xl font-extrabold tracking-tight">Revisa tu correo</h1>
      <p className="mt-3 text-muted-foreground">
        Te enviamos un enlace para confirmar tu cuenta. Ábrelo y volverás aquí, listo para conocer a tu tutor.
      </p>
      <Suspense>
        <ResendVerification />
      </Suspense>
    </div>
  );
}
